"""APScheduler cron jobs configuration for TribuQuest."""
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.services.penalties import apply_daily_penalties, send_evening_reminders

log = logging.getLogger("tribuquest.scheduler")
scheduler = AsyncIOScheduler()


def init_scheduler():
    """Register daily cron jobs and start the scheduler."""
    scheduler.add_job(send_evening_reminders, "cron", hour=19, minute=0, id="evening_reminders", replace_existing=True)
    scheduler.add_job(apply_daily_penalties, "cron", hour=20, minute=0, id="daily_penalties", replace_existing=True)
    try:
        scheduler.start()
        log.info("APScheduler started successfully (19:00 reminders, 20:00 penalties)")
    except Exception as e:
        log.warning(f"Could not start APScheduler: {e}")


def shutdown_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        log.info("APScheduler shutdown successfully")
