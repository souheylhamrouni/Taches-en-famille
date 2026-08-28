"""Reward and Claim models & schemas with Delivery Workflow (Feature C)."""
from typing import Optional, Literal
from pydantic import BaseModel, Field


class RewardCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    point_cost: Optional[int] = None
    cost: Optional[int] = None
    icon: Optional[str] = "🎁"
    stock: Optional[int] = -1


class RewardClaim(BaseModel):
    reward_id: str


class ClaimDeliverRequest(BaseModel):
    note: Optional[str] = None
