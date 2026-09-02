"""Menu (weekly meal plan) models."""
from typing import Optional, Literal
from pydantic import BaseModel, Field

MEAL_TYPES = ["lunch", "dinner"]


class MenuEntryCreate(BaseModel):
    day_of_week: int = Field(ge=0, le=6)  # 0=Monday, 6=Sunday
    meal_type: Literal["lunch", "dinner"]
    title: str = Field(min_length=1, max_length=100)
    notes: Optional[str] = Field(default="", max_length=500)


class MenuEntryPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=500)
