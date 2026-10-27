import os
import re
from flask import Flask, request, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
import mysql.connector
from werkzeug.security import generate_password_hash, check_password_hash

# Folder frontend
frontend_folder = os.path.abspath(os.path.join(os.path.dirname(__file__), '../frontend'))

app = Flask(__name__, static_folder=frontend_folder, static_url_path='')
app.config['SECRET_KEY'] = 'nettrack_secret_key'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Konfigurasi Database MySQL (Laragon)
db_config = {
    'host': 'localhost',
    'user': 'root',
    'password': '',
    'database': 'nettrack_db'
}

online_users = {}
ID_PATTERN = re.compile(r'^[A-Za-z0-9_]{3,30}$')

def get_db_connection():
    try:
        return mysql.connector.connect(**db_config)
    except mysql.connector.Error as err:
        print(f"-> [ERROR DATABASE CONNECTION]: {err}")
        return None

def get_client_ip():
    ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    if ip and ',' in ip:
        ip = ip.split(',')[0].strip()
    return ip

# ==========================================
# ROUTE FILE STATIC FRONTEND
# ==========================================
@app.route('/')
def serve_index():
    return send_from_directory(frontend_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(frontend_folder, path)

# ==========================================
# EVENT SOCKET.IO: AUTENTIKASI
# ==========================================
@socketio.on('register_account')
def handle_register_account(data):
    data = data or {}
    user_id = (data.get('user_id') or '').strip().lower()
    user_name = (data.get('user_name') or '').strip()
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''

    if not user_id or not user_name or not email or not password:
        emit('auth_response', {'status': 'error', 'message': 'Semua kolom wajib diisi!'})
        return
    if not ID_PATTERN.match(user_id):
        emit('auth_response', {'status': 'error', 'message': 'ID hanya boleh huruf, angka, dan underscore (3-30 karakter)!'})
        return
    if len(password) < 6:
        emit('auth_response', {'status': 'error', 'message': 'Password minimal 6 karakter!'})
        return

    conn = get_db_connection()
    if not conn:
        emit('auth_response', {'status': 'error', 'message': 'Server tidak terhubung ke database!'})
        return

    try:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM users WHERE user_id = %s OR email = %s LIMIT 1", (user_id, email))
        if cursor.fetchone():
            emit('auth_response', {'status': 'error', 'message': 'ID atau Email sudah digunakan!'})
            return

        cursor.execute(
            """
            INSERT INTO users (user_id, username, email, password, ip_address, created_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            """,
            (user_id, user_name, email, generate_password_hash(password), get_client_ip())
        )
        conn.commit()
        print(f"-> [REGISTER SUCCESS] {user_name} ({user_id})")
        emit('auth_response', {
            'status': 'success',
            'action': 'register',
            'message': 'Registrasi berhasil! Silakan login.'
        })
    except Exception as e:
        print(f"-> [ERROR REGISTER]: {e}")
        emit('auth_response', {'status': 'error', 'message': 'Terjadi kesalahan sistem saat registrasi.'})
    finally:
        conn.close()

@socketio.on('login_account')
def handle_login_account(data):
    data = data or {}
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''

    conn = get_db_connection()
    if not conn:
        emit('auth_response', {'status': 'error', 'message': 'Server tidak terhubung ke database!'})
        return

    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT user_id, username, password FROM users WHERE email = %s LIMIT 1", (email,))
        user = cursor.fetchone()

        if not (user and check_password_hash(user['password'], password)):
            emit('auth_response', {'status': 'error', 'message': 'Email atau Password salah!'})
            return

        user_id = user['user_id']
        user_name = user['username']

        cursor.execute(
            "UPDATE users SET ip_address = %s, last_login = NOW() WHERE user_id = %s",
            (get_client_ip(), user_id)
        )
        conn.commit()

        # Ambil riwayat chat beserta username lawan bicara
        cursor.execute(
            """
            SELECT m.sender_id, m.sender_name, m.receiver_id,
                   u.username AS receiver_name, m.message, m.created_at
            FROM messages m
            LEFT JOIN users u ON u.user_id = m.receiver_id
            WHERE m.sender_id = %s OR m.receiver_id = %s
            ORDER BY m.created_at ASC, m.id ASC
            """,
            (user_id, user_id)
        )
        history = cursor.fetchall()
        for row in history:
            if row['created_at']:
                row['created_at'] = row['created_at'].isoformat()

        old = online_users.get(request.sid)
        if old:
            leave_room(old['user_id'])
        online_users[request.sid] = {'user_id': user_id, 'user_name': user_name}
        join_room(user_id)

        print(f"-> [LOGIN SUCCESS] {user_name} ({user_id}) dari IP: {get_client_ip()}")
        emit('auth_response', {
            'status': 'success',
            'action': 'login',
            'user_id': user_id,
            'user_name': user_name,
            'history': history
        })
    except Exception as e:
        print(f"-> [ERROR LOGIN]: {e}")
        emit('auth_response', {'status': 'error', 'message': 'Terjadi kesalahan sistem.'})
    finally:
        conn.close()

@socketio.on('disconnect')
def handle_disconnect(*args):
    online_users.pop(request.sid, None)

# ==========================================
# EVENT SOCKET.IO: TRANSMISI CHAT
# ==========================================
@socketio.on('send_message')
def handle_send_message(data):
    sender = online_users.get(request.sid)
    if not sender:
        emit('message_error', {'message': 'Sesi tidak valid, silakan login ulang.'})
        return

    data = data or {}
    receiver_id = (data.get('receiver_id') or '').strip()
    message = data.get('message') or ''

    if not receiver_id or not message or len(message) > 5000:
        emit('message_error', {'message': 'Pesan atau penerima tidak valid.'})
        return

    conn = get_db_connection()
    if not conn:
        emit('message_error', {'message': 'Gagal terhubung ke database.'})
        return

    try:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM users WHERE user_id = %s LIMIT 1", (receiver_id,))
        row = cursor.fetchone()
        if not row:
            emit('message_error', {'message': f'ID "{receiver_id}" tidak ditemukan!'})
            return
        receiver_id = row[0]

        cursor.execute(
            """
            INSERT INTO messages (sender_id, sender_name, receiver_id, message, created_at)
            VALUES (%s, %s, %s, %s, NOW())
            """,
            (sender['user_id'], sender['user_name'], receiver_id, message)
        )
        conn.commit()
        print(f"-> [SUCCESS] Pesan {sender['user_id']} -> {receiver_id} tersimpan di MySQL")
    except Exception as e:
        print(f"-> [ERROR DATABASE MESSAGES]: {e}")
        emit('message_error', {'message': 'Pesan gagal disimpan.'})
        return
    finally:
        conn.close()

    emit('receive_message', {
        'sender_id': sender['user_id'],
        'sender_name': sender['user_name'],
        'receiver_id': receiver_id,
        'message': message,
        'time': data.get('time', '')
    }, to=receiver_id)

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)