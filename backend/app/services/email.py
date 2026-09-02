"""Email service — SMTP or dev console fallback.

Sends transactional emails (registration confirmation, password reset).
In development (USE_MOCK_DB=true or no SMTP configured), the service
logs the email content to the console instead of sending.
"""
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional

log = logging.getLogger("tribuquest.email")


class EmailService:
    def __init__(self):
        self.host = os.getenv("SMTP_HOST", "")
        self.port = int(os.getenv("SMTP_PORT", "587"))
        self.user = os.getenv("SMTP_USER", "")
        self.password = os.getenv("SMTP_PASSWORD", "")
        self.from_addr = os.getenv("SMTP_FROM", "no-reply@tribuquest.app")
        self.from_name = os.getenv("SMTP_FROM_NAME", "TribuQuest")
        self.app_url = os.getenv("EXPO_PUBLIC_APP_URL", "https://tribuquest.app")
        self._enabled = bool(self.host and self.user and self.password)

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def send(self, to: str, subject: str, html: str, text: Optional[str] = None) -> bool:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = f"{self.from_name} <{self.from_addr}>"
        msg["To"] = to
        msg.set_content(text or subject)
        msg.add_alternative(html, subtype="html")

        if not self._enabled:
            # Dev fallback: log the email so developers can grab the link
            log.info("=" * 60)
            log.info(f"[EMAIL DEV MODE] To: {to}")
            log.info(f"[EMAIL DEV MODE] Subject: {subject}")
            log.info(f"[EMAIL DEV MODE] Body (text):\n{text or subject}")
            log.info(f"[EMAIL DEV MODE] Body (html):\n{html}")
            log.info("=" * 60)
            return True

        try:
            context = ssl.create_default_context()
            with smtplib.SMTP(self.host, self.port) as server:
                server.starttls(context=context)
                server.login(self.user, self.password)
                server.send_message(msg)
            log.info(f"Email sent to {to} - {subject}")
            return True
        except Exception as e:
            log.exception(f"Failed to send email to {to}: {e}")
            return False

    def render_verification_email(self, name: str, verify_url: str) -> tuple[str, str]:
        """Returns (subject, html_body) for the registration confirmation email."""
        subject = "Confirme ton inscription à TribuQuest"
        html = f"""
<div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h1 style="color: #FF9600; margin: 0;">🦸 TribuQuest</h1>
  </div>
  <h2 style="color: #1a1a1a;">Bienvenue {name} !</h2>
  <p style="color: #444; line-height: 1.5;">
    Merci de t'être inscrit(e) sur <strong>TribuQuest</strong>, l'application qui transforme les corvées en aventure pour toute la famille !
  </p>
  <p style="color: #444; line-height: 1.5;">
    Pour activer ton compte et commencer l'aventure, clique sur le bouton ci-dessous :
  </p>
  <div style="text-align: center; margin: 32px 0;">
    <a href="{verify_url}" style="background-color: #58CC02; color: white; padding: 16px 32px; text-decoration: none; border-radius: 24px; font-weight: 800; font-size: 16px; display: inline-block;">
      ✅ Confirmer mon inscription
    </a>
  </div>
  <p style="color: #888; font-size: 12px; line-height: 1.5;">
    Si le bouton ne fonctionne pas, copie-colle ce lien dans ton navigateur :<br>
    <a href="{verify_url}" style="color: #58CC02;">{verify_url}</a>
  </p>
  <p style="color: #888; font-size: 12px; line-height: 1.5;">
    Ce lien expire dans 24 heures. Si tu n'es pas à l'origine de cette inscription, ignore ce message.
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="color: #888; font-size: 11px; text-align: center;">
    © TribuQuest — L'aventure familiale au quotidien
  </p>
</div>
""".strip()
        text = f"Bienvenue {name} !\n\nConfirme ton inscription en cliquant sur ce lien :\n{verify_url}\n\nCe lien expire dans 24 heures."
        return subject, html


email_service = EmailService()
