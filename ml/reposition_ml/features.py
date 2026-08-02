from __future__ import annotations

FEATURE_NAMES = [
    "distance_nm",
    "ground_time_hours",
    "origin_private_score",
    "dest_private_score",
    "fbo_pair_score",
    "is_asymmetric",
    "is_return_corridor",
    "short_turnaround",
    "idle_then_ferry",
    "one_way_ratio_7d",
    "legs_last_48h",
    "hour_of_day_utc",
    "dow",
    "aircraft_class_ord",
    "typical_seats",
    "same_country",
    "prior_leg_distance_nm",
    "heading_delta_deg",
]

# Indices useful when building LSTM step vectors from the same schema.
SEQ_LEN = 4
FEATURE_DIM = len(FEATURE_NAMES)
