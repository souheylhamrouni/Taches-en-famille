"""User models & schemas."""
from typing import Optional, Literal
from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=4)
    name: Optional[str] = "Utilisateur"
    role: Literal["parent", "child"] = "child"
    family_id: Optional[str] = None
    family_name: Optional[str] = "Famille"
    avatar: Optional[str] = None
    pin: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class PinVerify(BaseModel):
    pin: str


class PinChange(BaseModel):
    current_pin: str = Field(min_length=4, max_length=6, pattern=r'^\d{4,6}$')
    new_pin: str = Field(min_length=6, max_length=6, pattern=r'^\d{6}$')


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    avatar: Optional[str] = None


class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: Optional[str] = None
    email: Optional[EmailStr] = None
    code: Optional[str] = None
    new_password: str = Field(min_length=6)
