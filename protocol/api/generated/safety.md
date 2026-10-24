# Safety Rules

| Name | Type | Safety | Status | Evidence | Notes |
| --- | --- | --- | --- | --- | --- |
| Motion or auto-learn commands | safety_rule | motion_or_autolearn | documented |  | Commands that can move the motor or alter learned angle/throttle calibration are documentation-only unless explicitly designed later. |
| Bulk restore commands | safety_rule | bulk_restore | documented |  | Bulk writes require stronger confirmation than ordinary parameter writes. |
