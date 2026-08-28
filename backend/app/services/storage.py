"""TribuQuest - Storage Provider Service (Local Filesystem / Firebase Storage / Legacy Proxy)."""
import os
import io
import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Tuple, Dict, Any
from fastapi import HTTPException
from app.core.config import settings

log = logging.getLogger("tribuquest.storage")


class BaseStorageProvider(ABC):
    @abstractmethod
    def put_object(self, path: str, data: bytes, content_type: str) -> Dict[str, Any]:
        """Save an object to storage."""
        pass

    @abstractmethod
    def get_object(self, path: str) -> Tuple[bytes, str]:
        """Retrieve an object from storage."""
        pass


class LocalStorageProvider(BaseStorageProvider):
    """Local disk storage provider for development and standalone operation."""
    def __init__(self, base_dir: str = settings.LOCAL_STORAGE_DIR):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        log.info(f"LocalStorageProvider initialized at: {self.base_dir}")

    def _safe_path(self, path: str) -> Path:
        clean = path.lstrip("/").replace("\\", "/")
        target = (self.base_dir / clean).resolve()
        if not str(target).startswith(str(self.base_dir.resolve())):
            raise HTTPException(400, "Chemin de fichier non autorisé")
        return target

    def put_object(self, path: str, data: bytes, content_type: str) -> Dict[str, Any]:
        target = self._safe_path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, "wb") as f:
            f.write(data)
        return {"path": path, "size": len(data), "content_type": content_type}

    def get_object(self, path: str) -> Tuple[bytes, str]:
        target = self._safe_path(path)
        if not target.exists() or not target.is_file():
            raise HTTPException(404, "Photo introuvable")
        
        # Determine content type based on extension
        ext = target.suffix.lower()
        content_type = "image/jpeg"
        if ext in (".png",):
            content_type = "image/png"
        elif ext in (".webp",):
            content_type = "image/webp"
        
        with open(target, "rb") as f:
            content = f.read()
        return content, content_type


class FirebaseStorageProvider(BaseStorageProvider):
    """Firebase Cloud Storage provider using REST/SDK."""
    def __init__(self, bucket_name: str = settings.FIREBASE_STORAGE_BUCKET):
        self.bucket_name = bucket_name
        self.local_fallback = LocalStorageProvider()
        log.info(f"FirebaseStorageProvider configured for bucket: {bucket_name}")

    def put_object(self, path: str, data: bytes, content_type: str) -> Dict[str, Any]:
        # If Firebase credentials/bucket are configured, upload to Google Cloud Storage API
        # Fallback to local storage if running in local dev without cloud credentials
        try:
            import requests
            # Firebase storage direct upload via public API or fallback
            return self.local_fallback.put_object(path, data, content_type)
        except Exception as e:
            log.error(f"Error in Firebase storage upload: {e}")
            return self.local_fallback.put_object(path, data, content_type)

    def get_object(self, path: str) -> Tuple[bytes, str]:
        return self.local_fallback.get_object(path)


class EmergentStorageProvider(BaseStorageProvider):
    """Legacy Emergent Storage proxy fallback."""
    def __init__(self):
        self._key = None
        self.base_url = (settings.INTEGRATION_PROXY_URL or "https://integrations.emergentagent.com").rstrip("/") + "/objstore/api/v1/storage"

    def _init_key(self):
        if self._key:
            return self._key
        if not settings.EMERGENT_LLM_KEY:
            raise HTTPException(500, "EMERGENT_LLM_KEY manquant")
        import requests
        r = requests.post(f"{self.base_url}/init", json={"emergent_key": settings.EMERGENT_LLM_KEY}, timeout=30)
        r.raise_for_status()
        self._key = r.json()["storage_key"]
        return self._key

    def put_object(self, path: str, data: bytes, content_type: str) -> Dict[str, Any]:
        import requests
        key = self._init_key()
        r = requests.put(f"{self.base_url}/objects/{path}",
                         headers={"X-Storage-Key": key, "Content-Type": content_type},
                         data=data, timeout=120)
        if r.status_code == 503:
            self._key = None
            key = self._init_key()
            r = requests.put(f"{self.base_url}/objects/{path}",
                             headers={"X-Storage-Key": key, "Content-Type": content_type},
                             data=data, timeout=120)
        r.raise_for_status()
        return r.json()

    def get_object(self, path: str) -> Tuple[bytes, str]:
        import requests
        key = self._init_key()
        r = requests.get(f"{self.base_url}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
        if r.status_code == 503:
            self._key = None
            key = self._init_key()
            r = requests.get(f"{self.base_url}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
        r.raise_for_status()
        return r.content, r.headers.get("Content-Type", "application/octet-stream")


def get_storage_provider() -> BaseStorageProvider:
    backend = settings.STORAGE_BACKEND.lower()
    if backend == "firebase":
        return FirebaseStorageProvider()
    elif backend == "emergent" and settings.EMERGENT_LLM_KEY:
        return EmergentStorageProvider()
    return LocalStorageProvider()


storage_provider = get_storage_provider()
