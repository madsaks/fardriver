# File Formats

| Name | Format | Safety | Status | Evidence | Notes |
| --- | --- | --- | --- | --- | --- |
| Official HEB export | heb | passive_observe | documented | `official.ConnectPage.OnExportClicked.5873` (reference/decompiled/official/src/MotorNet6/MotorNet6/ConnectPage.cs:5873) | Official app exports 156 main parameter words plus 192 extended/CAN words into a 696-byte file. |
| Worthless HEB export | heb | passive_observe | documented | `worthless.C0205fk.heb_export.179` (reference/decompiled/worthless/jadx/sources/p000a/C0205fk.java:179) | Official exports main + extended blocks; Worthless fills only the main block. |
