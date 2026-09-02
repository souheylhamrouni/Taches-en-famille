"""Challenge, Event, Shopping, and Pause models."""
from typing import Optional, List, Literal
from pydantic import BaseModel, Field


# Challenges
class ChallengeCreate(BaseModel):
    title: str = Field(min_length=2)
    description: Optional[str] = ""
    target: int = Field(ge=1, default=50)
    metric: Literal["points", "tasks"] = "points"
    bonus_points: int = Field(ge=1, default=20)
    end_date: str  # YYYY-MM-DD


class ChallengePatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    target: Optional[int] = None
    metric: Optional[Literal["points", "tasks"]] = None
    bonus_points: Optional[int] = None
    end_date: Optional[str] = None


# Events
class EventCreate(BaseModel):
    title: str = Field(min_length=2)
    start_time: str
    end_time: Optional[str] = None
    category: Optional[str] = "family"
    notes: Optional[str] = ""
    assigned_to: Optional[List[str]] = []


class EventPatch(BaseModel):
    title: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[List[str]] = None


# Shopping
class ShoppingItemCreate(BaseModel):
    title: str = Field(min_length=1)
    quantity: Optional[str] = "1"
    category: Optional[str] = "general"


class ShoppingItemPatch(BaseModel):
    title: Optional[str] = None
    quantity: Optional[str] = None
    category: Optional[str] = None
    completed: Optional[bool] = None


# Pauses
class PauseCreate(BaseModel):
    user_ids: List[str]
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    reason: Optional[str] = "Vacances"


# Family
class FamilyPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2)
    reminder_hour: Optional[int] = Field(default=None, ge=0, le=23)
    reminder_minute: Optional[int] = Field(default=None, ge=0, le=59)
    penalty_hour: Optional[int] = Field(default=None, ge=0, le=23)
    penalty_minute: Optional[int] = Field(default=None, ge=0, le=59)
