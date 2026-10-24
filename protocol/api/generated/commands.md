# Commands

| Name | Address | Payload | Safety | Status | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Auto-learn start | 160 | `[136, 2]` | motion_or_autolearn | do_not_implement | `gdriver.command_parser.auto_learn_start` (reference/decompiled/gdriver/decompiled.js:1362983) | GDriver classifies address 160 value 0x0288 as auto_learn_start. |
| Auto-learn exit | 160 | `[136, 3]` | motion_or_autolearn | do_not_implement | `gdriver.command_parser.auto_learn_exit` (reference/decompiled/gdriver/decompiled.js:1362980) | GDriver classifies address 160 value 0x0388 as auto_learn_exit. |
| Restore auto-learn default config | 160 | `[136, 11]` | destructive_config | documented | `official.ProControlPage.OnButtonResetClicked.9138` (reference/decompiled/official/src/MotorNet6/MotorNet6/ProControlPage.cs:9138)<br>`official.ParaPage.OnButtonResetClicked.3526` (reference/decompiled/official/src/MotorNet6/MotorNet6/ParaPage.cs:3526) | Preset/config restore, not the same as live auto-learn start. |
