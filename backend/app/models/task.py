"""Task models & schemas."""
from typing import Optional, List, Literal
from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    title: str = Field(min_length=2)
    description: Optional[str] = ""
    points_worth: int = Field(ge=1, default=10)
    penalty_points: int = Field(ge=0, default=5)
    frequency: Literal["daily", "weekly", "once"] = "daily"
    assigned_to: List[str] = []
    photo_required: bool = True
    due_time: Optional[str] = "20:00"
    icon: Optional[str] = "checkbox"


class TaskPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    points_worth: Optional[int] = None
    penalty_points: Optional[int] = None
    frequency: Optional[Literal["daily", "weekly", "once"]] = None
    assigned_to: Optional[List[str]] = None
    photo_required: Optional[bool] = None
    due_time: Optional[str] = None
    icon: Optional[str] = None
    active: Optional[bool] = None


class VoteRequest(BaseModel):
    approved: bool
    comment: Optional[str] = None
