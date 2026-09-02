"""APScheduler cron jobs configuration for TribuQuest."""
import logging
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.db.mongo import db
from app.services.penalties import apply_daily_penalties, send_evening_reminders

log = logging.getLogger("tribuquest.scheduler")
scheduler = AsyncIOScheduler()


async def check_scheduled_jobs():
    """Check every minute which families have triggered their reminder/penalty time.

    Each family has its own configured reminder_hour/reminder_minute and
    penalty_hour/penalty_minute (defaults: 19:00 and 20:00). A job is fired once
    per day per family, tracked in db.scheduled_runs.
    """
    now = datetime.now(timezone.utc)
    cur_h = now.hour
    cur_m = now.minute
    today = now.date().isoformat()

    families = await db.families.find({}, {"_id": 0, "id": 1, "reminder_hour": 1, "reminder_minute": 1, "penalty_hour": 1, "penalty_minute": 1}).to_list(500)
    for fam in families:
        fam_id = fam["id"]
        rh = fam.get("reminder_hour", 19)
        rm = fam.get("reminder_minute", 0)
        ph = fam.get("penalty_hour", 20)
        pm = fam.get("penalty_minute", 0)

        if cur_h == rh and cur_m == rm:
            key = f"reminder_{fam_id}_{today}"
            existing = await db.scheduled_runs.find_one({"id": key})
            if not existing:
                await db.scheduled_runs.insert_one({"id": key, "family_id": fam_id, "type": "reminder", "day": today, "at": now.isoformat()})
                try:
                    await send_evening_reminders(only_family_id=fam_id)
                except Exception as e:
                    log.exception(f"Reminder job failed for family {fam_id}: {e}")

        if cur_h == ph and cur_m == pm:
            key = f"penalty_{fam_id}_{today}"
            existing = await db.scheduled_runs.find_one({"id": key})
            if not existing:
                await db.scheduled_runs.insert_one({"id": key, "family_id": fam_id, "type": "penalty", "day": today, "at": now.isoformat()})
                try:
                    await apply_daily_penalties(only_family_id=fam_id)
                except Exception as e:
                    log.exception(f"Penalty job failed for family {fam_id}: {e}")


def init_scheduler():
    """Register the per-minute scheduler job and start the scheduler."""
    scheduler.add_job(check_scheduled_jobs, "cron", minute="*", id="family_scheduler", replace_existing=True)
    try:
        scheduler.start()
        log.info("APScheduler started (per-family reminder/penalty scheduler)")
    except Exception as e:
        log.warning(f"Could not start APScheduler: {e}")


def shutdown_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        log.info("APScheduler shutdown successfully")
