from typing import Optional

from pydantic import BaseModel, Field


class CropInput(BaseModel):
    N: float = Field(..., description="Nitrogen (kg/ha ratio as in the training data)")
    P: float = Field(..., description="Phosphorus")
    K: float = Field(..., description="Potassium")
    temperature: float = Field(..., description="Temperature in °C")
    humidity: float = Field(..., description="Relative humidity (%)")
    ph: float = Field(..., description="Soil pH")
    rainfall: float = Field(..., description="Rainfall (mm)")


class FertilizerInput(BaseModel):
    Nitrogen: float = Field(..., description="Nitrogen")
    Potassium: float = Field(..., description="Potassium")
    Phosphorous: float = Field(..., description="Phosphorous")
    temperature: Optional[float] = Field(None, description="Optional: temperature °C (enables the 8-input model)")
    humidity: Optional[float] = Field(None, description="Optional: relative humidity %")
    moisture: Optional[float] = Field(None, description="Optional: soil moisture %")
    soil_type: Optional[str] = Field(None, description="Optional: Red, Black, Clayey, Sandy, Loamy (or app names)")
    crop_type: Optional[str] = Field(None, description="Optional: crop being fertilised (e.g. Paddy, Maize, ragi)")


class PredictionResponse(BaseModel):
    prediction: str
    details: Optional[dict] = None
