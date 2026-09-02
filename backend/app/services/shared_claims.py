"""Shared claims service for multi-assignee tasks.

When a task is assigned to multiple people, the first person to complete it
"claims" it for the day. Others see it as claimed and cannot complete it.
If the claim is rejected, it becomes available again for everyone.
If approved, only the claimer gets points, others get no points but no penalty.
"""
import logging
from datetime import date
from typing import Optional
from app.db.mongo import db
from app.core.security import new_id, now

log = logging.getLogger("tribuquest.shared_claims")


async def get_shared_claim(task_id: str, day_str: str) -> Optional[dict]:
    """Get the shared claim for a task on a given day, if any."""
    return await db.shared_claims.find_one(
        {"task_id": task_id, "day": day_str},
        {"_id": 0}
    )


async def create_shared_claim(task_id: str, family_id: str, user_id: str, user_name: str) -> dict:
    """Create a shared claim for a task. Returns the claim document."""
    claim = {
        "id": new_id(),
        "task_id": task_id,
        "family_id": family_id,
        "day": date.today().isoformat(),
        "claimed_by": user_id,
        "claimed_by_name": user_name,
        "status": "pending",
        "created_at": now(),
    }
    await db.shared_claims.insert_one(claim)
    claim.pop("_id", None)
    return claim


async def update_shared_claim_status(task_id: str, day_str: str, status: str) -> None:
    """Update the status of a shared claim (approved/rejected)."""
    await db.shared_claims.update_one(
        {"task_id": task_id, "day": day_str},
        {"$set": {"status": status}}
    )


async def is_task_claimed_by_other(task_id: str, user_id: str, day_str: str) -> Optional[dict]:
    """Check if a task has been claimed by someone other than the given user.

    Returns the claim document if claimed by another user, None otherwise.
    """
    claim = await db.shared_claims.find_one(
        {"task_id": task_id, "day": day_str, "claimed_by": {"$ne": user_id}},
        {"_id": 0}
    )
    return claim


async def get_approved_shared_claim_for_task(task_id: str, day_str: str) -> Optional[dict]:
    """Get an approved shared claim for a task on a given day."""
    return await db.shared_claims.find_one(
        {"task_id": task_id, "day": day_str, "status": "approved"},
        {"_id": 0}
    )


async def is_task_shared(task: dict) -> bool:
    """Check if a task is shared (assigned to multiple people)."""
    assigned = task.get("assigned_to", [])
    return len(assigned) > 1
