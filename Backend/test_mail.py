import smtplib
from email.message import EmailMessage

MAIL_ADDRESS = 'tegarprasetya063@gmail.com'        # isi emailmu
MAIL_APP_PASSWORD = '123456'  # isi App Password, tanpa spasi

msg = EmailMessage()
msg['Subject'] = 'Tes NetTrack'
msg['From'] = MAIL_ADDRESS
msg['To'] = MAIL_ADDRESS   # dikirim ke diri sendiri
msg.set_content('Kalau email ini masuk, konfigurasi SMTP sudah benar.')

try:
    with smtplib.SMTP('smtp.gmail.com', 587, timeout=20) as s:
        s.starttls()
        s.login(MAIL_ADDRESS, MAIL_APP_PASSWORD)
        s.send_message(msg)
    print("BERHASIL: email terkirim, cek inbox")
except Exception as e:
    print("GAGAL:", type(e).__name__, "-", e)