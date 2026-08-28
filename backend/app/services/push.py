"""TribuQuest - Push Notifications Service using Expo Push API."""
import logging
from typing import Optional, Dict, Any, List
import httpx
from app.core.config import settings

log = logging.getLogger("tribuquest.push")


class PushService:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=10.0)

    async def send_push(
        self,
        token: str,
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
        sound: str = "default",
        channel_id: str = "default"
    ) -> bool:
        """Send a push notification to an Expo push token or native device token."""
        if not token:
            return False
        
        # Build Expo push payload
        payload = {
            "to": token,
            "title": title,
            "body": body,
            "sound": sound,
            "channelId": channel_id,
            "data": data or {}
        }
        
        try:
            r = await self.client.post(settings.EXPO_PUSH_URL, json=payload)
            if r.status_code == 200:
                log.info(f"Push notification sent successfully to token {token[:10]}...")
                return True
            else:
                log.warning(f"Expo push returned {r.status_code}: {r.text}")
                return False
        except Exception as e:
            log.warning(f"Failed to send push notification: {e}")
            return False

    async def notify_users(
        self,
        users: List[dict],
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None
    ):
        """Notify a list of user dictionaries who have a registered push_token."""
        for u in users:
            token = u.get("push_token")
            if token:
                await self.send_push(token, title, body, data)


push_service = PushService()
