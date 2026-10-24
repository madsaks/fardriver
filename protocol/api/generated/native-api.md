# Native API catalog

Metadata only; function bodies and the library are excluded from Git. FarDriver behavior is interpreted in [native protocol findings](../../../docs/native-protocol.md). Other protocol families below are inventoried, not semantically reverse engineered.

SHA-256: `6d7b3f899c3c67ab2700c27c523a6aaf37efdd05d2d2f667da5ac60e809b471c`. Architecture: AArch64 little-endian ELF64. Ghidra 11.0.3; image base 0x100000. ELF addresses below exclude that Ghidra base.

| Export | ELF address | Bytes | Java return | Java arguments |
| --- | --- | --- | --- | --- |
| ncCreateSession | 0xbc48 | 4276 |  |  |
| ncDestroySession | 0xccfc | 4004 |  |  |
| ncFdHandleNotification | 0xdca0 | 92 |  |  |
| ncFdGetTelemetry | 0xe010 | 76 |  |  |
| ncFdBuildReadPacket | 0xe05c | 108 |  |  |
| ncFdBuildWritePacket | 0xe0c8 | 260 |  |  |
| ncFdBuildOldCommand | 0xe1cc | 64 |  |  |
| ncFdFwCondition | 0xe20c | 248 |  |  |
| ncFdFwSync | 0xe304 | 144 |  |  |
| ncJbdBuildReadRequest | 0xe394 | 52 |  |  |
| ncJbdParseBasicInfo | 0xe3c8 | 84 |  |  |
| ncJbdParseCellVoltages | 0xe7dc | 284 |  |  |
| ncJbdBuildMosfetControl | 0xe8f8 | 104 |  |  |
| ncBmsGetTelemetry | 0xe960 | 624 |  |  |
| ncBmsGetCellVoltages | 0xebd0 | 204 |  |  |
| ncBmsGetErrorMessage | 0xec9c | 128 |  |  |
| ncBmsGetStatus | 0xed1c | 316 |  |  |
| ncBmsGetTemperatures | 0xee58 | 216 |  |  |
| ncFdBuildPasswordData | 0xef30 | 108 |  |  |
| ncFdGetConfig | 0xef9c | 64 |  |  |
| ncFdGetErrorMessage | 0xefdc | 124 |  |  |
| ncFdGetModelType | 0xf058 | 124 |  |  |
| ncFdGetProductCode | 0xf0d4 | 124 |  |  |
| ncFdGetStoredPassword | 0xf150 | 124 |  |  |
| ncFdSetProductInfo | 0xf1cc | 152 |  |  |
| ncFdGetRpmCurve | 0xf264 | 192 |  |  |
| ncFdGetNRatio | 0xf324 | 208 |  |  |
| ncFdGetPollRegisters | 0xf3f4 | 56 |  |  |
| ncFdGetConfigRegisters | 0xf42c | 152 |  |  |
| ncFdGetRawConfigWords | 0xf4c4 | 568 |  |  |
| ncFdGenerateDrmKey | 0xf6fc | 168 |  |  |
| ncFdGetDrmStatus | 0xff74 | 272 |  |  |
| ncFdBuildRemoteDrive | 0x10084 | 328 |  |  |
| ncFdGetProtocolSeen | 0x101cc | 40 |  |  |
| ncFdResetProtocolSeen | 0x101f4 | 32 |  |  |
| ncAntBuildRequest | 0x10214 | 60 |  |  |
| ncAntParseStatus | 0x10250 | 96 |  |  |
| ncAntBuildAuthCommand | 0x10c88 | 264 |  |  |
| ncAntBuildControlCommand | 0x10d90 | 136 |  |  |
| ncJkBuildRequest | 0x10e18 | 136 |  |  |
| ncJkBuildWriteCommand | 0x10ea0 | 156 |  |  |
| ncJkParseDeviceInfo | 0x10f3c | 100 |  |  |
| ncJkParseCellInfo | 0x115b8 | 104 |  |  |
| ncJkGetModelName | 0x1181c | 124 |  |  |
| ncJkGetHwVersion | 0x11898 | 124 |  |  |
| ncJkGetSwVersion | 0x11914 | 124 |  |  |
| ncJkGetProtocolVersion | 0x11990 | 40 |  |  |
| ncVescBuildRequest | 0x119b8 | 56 |  |  |
| ncVescHandleData | 0x119f0 | 980 |  |  |
| ncVescGetTelemetry | 0x11f98 | 128 |  |  |
| ncVescGetFaultString | 0x12018 | 124 |  |  |
| ncVescGetHwName | 0x12094 | 124 |  |  |
| ncVescGetStatus | 0x12110 | 76 |  |  |
| ncVescBuildInt32Command | 0x1215c | 156 |  |  |
| ncVescBuildTempConfig | 0x121f8 | 28 |  |  |
| ncVescGetCanDevices | 0x1269c | 400 |  |  |
| ncVescBuildCanForward | 0x1282c | 252 |  |  |
| ncVescHandleCanData | 0x12928 | 612 |  |  |
| ncVescGetCanTelemetry | 0x12b8c | 216 |  |  |
| ncDalyBuildPollCommand | 0x12c64 | 24 |  |  |
| ncDalyBuildMosCommand | 0x12c7c | 140 |  |  |
| ncDalyProcessData | 0x12d08 | 104 |  |  |
| ncDalyGetProtocol | 0x12fe8 | 52 |  |  |
| ncDalyBuildA5PollCommand | 0x1301c | 180 |  |  |
| ncDalyBuildA5MosCommand | 0x130d0 | 124 |  |  |
| ncVotolBuildReadPage | 0x1314c | 168 |  |  |
| ncVotolBuildLdget | 0x131f4 | 204 |  |  |
| ncVotolBuildShow | 0x132c0 | 188 |  |  |
| ncVotolBuildHandshake | 0x1337c | 248 |  |  |
| ncVotolBuildWritePage | 0x13474 | 312 |  |  |
| ncVotolBuildReset | 0x135ac | 176 |  |  |
| ncVotolBuildRemoteThrottle | 0x1365c | 316 |  |  |
| ncVotolGetPageRaw | 0x13798 | 96 |  |  |
| ncVotolHandleData | 0x137f8 | 112 |  |  |
| ncVotolGetTelemetry | 0x13d60 | 164 |  |  |
| ncVotolGetStatus | 0x13e04 | 112 |  |  |
| ncVotolGetParams | 0x13e74 | 596 |  |  |
| ncEnerkeyBuildPollCommand | 0x140c8 | 164 |  |  |
| ncEnerkeyProcessData | 0x1416c | 220 |  |  |
| ncEnerkeyGetHandshakeStep | 0x14248 | 40 |  |  |
| ncSotionBuildTelemetryPoll | 0x14270 | 36 |  |  |
| ncSotionBuildAuthRead | 0x14294 | 80 |  |  |
| ncSotionBuildAuthWrite | 0x142e4 | 80 |  |  |
| ncSotionBuildParamRead | 0x14334 | 36 |  |  |
| ncSotionBuildParamWrite | 0x14358 | 304 |  |  |
| ncSotionBuildFactoryReset | 0x14488 | 72 |  |  |
| ncSotionBuildSelfLearnToggle | 0x144d0 | 52 |  |  |
| ncSotionBuildDirectionToggle | 0x14504 | 52 |  |  |
| ncSotionBuildSaveRestart | 0x14538 | 36 |  |  |
| ncSotionHandleData | 0x1455c | 112 |  |  |
| ncSotionGetTelemetry | 0x148ac | 100 |  |  |
| ncSotionGetStatus | 0x14910 | 88 |  |  |
| ncSotionGetParamRaw | 0x14968 | 124 |  |  |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdFwCondition | 0x18a28 | 424 | byte[] | byte[] bArr, int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdFwSync | 0x18bd0 | 224 | byte[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_createSession | 0x18cb0 | 76 | int | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_destroySession | 0x18cfc | 60 | void | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdHandleNotification | 0x18d38 | 172 | boolean | int i, byte[] bArr |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdBuildReadPacket | 0x18de4 | 148 | byte[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdBuildWritePacket | 0x18e78 | 236 | byte[] | int i, byte[] bArr |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdBuildOldCommand | 0x18f64 | 164 | byte[] | int i, int i2, int i3, int i4 |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdBuildPasswordData | 0x19008 | 196 | byte[] | String str |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdGetTelemetry | 0x190cc | 168 | float[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdGetConfig | 0x19174 | 1584 | int[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdGetErrorMessage | 0x197a4 | 104 | String | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdGetModelType | 0x1980c | 104 | String | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdGetProductCode | 0x19874 | 104 | String | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdSetProductInfo | 0x198dc | 168 | void | int i, String str, String str2 |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdGetStoredPassword | 0x19984 | 104 | String | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdGetRpmCurve | 0x199ec | 168 | byte[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdGetNRatio | 0x19a94 | 168 | byte[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdGetPollRegisters | 0x19b3c | 152 | byte[] |  |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdGetConfigRegisters | 0x19bd4 | 152 | byte[] |  |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdGetRawConfigWords | 0x19c6c | 168 | int[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdGenerateDrmKey | 0x19d14 | 168 | byte[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdGetDrmStatus | 0x19dbc | 104 | String | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdBuildRemoteDrive | 0x19e24 | 156 | byte[] | int i, int i2, int i3 |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdGetProtocolSeen | 0x19ec0 | 8 | int | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_fdResetProtocolSeen | 0x19ec8 | 8 | void | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_jbdBuildReadRequest | 0x19ed0 | 148 | byte[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_jbdParseBasicInfo | 0x19f64 | 320 | boolean | int i, byte[] bArr |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_jbdParseCellVoltages | 0x1a0a4 | 320 | boolean | int i, byte[] bArr |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_jbdBuildMosfetControl | 0x1a1e4 | 152 | byte[] | boolean z, boolean z2 |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_antBuildRequest | 0x1a27c | 156 | byte[] | boolean z |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_antParseStatus | 0x1a318 | 340 | boolean | int i, byte[] bArr, boolean z |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_antBuildAuthCommand | 0x1a46c | 320 | byte[] | String str |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_antBuildControlCommand | 0x1a5ac | 148 | byte[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_bmsGetTelemetry | 0x1a640 | 168 | float[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_bmsGetCellVoltages | 0x1a6e8 | 168 | float[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_bmsGetErrorMessage | 0x1a790 | 104 | String | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_bmsGetStatus | 0x1a7f8 | 168 | int[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_bmsGetTemperatures | 0x1a8a0 | 168 | float[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_jkBuildRequest | 0x1a948 | 152 | byte[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_jkBuildWriteCommand | 0x1a9e0 | 160 | byte[] | int i, int i2, int i3 |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_jkParseDeviceInfo | 0x1aa80 | 204 | boolean | int i, byte[] bArr |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_jkParseCellInfo | 0x1ab4c | 204 | boolean | int i, byte[] bArr |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_jkGetModelName | 0x1ac18 | 104 | String | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_jkGetHwVersion | 0x1ac80 | 104 | String | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_jkGetSwVersion | 0x1ace8 | 104 | String | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_jkGetProtocolVersion | 0x1ad50 | 8 | int | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_vescBuildRequest | 0x1ad58 | 152 | byte[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_vescHandleData | 0x1adf0 | 204 | boolean | int i, byte[] bArr |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_vescGetTelemetry | 0x1aebc | 168 | float[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_vescGetFaultString | 0x1af64 | 104 | String | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_vescGetHwName | 0x1afcc | 104 | String | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_vescGetStatus | 0x1b034 | 168 | int[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_vescBuildInt32Command | 0x1b0dc | 160 | byte[] | int i, int i2 |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_vescBuildTempConfig | 0x1b17c | 176 | byte[] | float f, float f2, float f3, float f4, float f5, float f6, float f7, float f8, float f9, float f10, boolean z |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_vescGetCanDevices | 0x1b22c | 168 | int[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_vescBuildCanForward | 0x1b2d4 | 236 | byte[] | int i, byte[] bArr |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_vescHandleCanData | 0x1b3c0 | 220 | boolean | int i, int i2, byte[] bArr |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_vescGetCanTelemetry | 0x1b49c | 176 | float[] | int i, int i2 |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_dalyBuildPollCommand | 0x1b54c | 148 | byte[] |  |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_dalyBuildMosCommand | 0x1b5e0 | 172 | byte[] | boolean z, boolean z2 |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_dalyProcessData | 0x1b68c | 204 | boolean | int i, byte[] bArr |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_dalyGetProtocol | 0x1b758 | 8 | int | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_dalyBuildA5PollCommand | 0x1b760 | 164 | byte[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_dalyBuildA5MosCommand | 0x1b804 | 172 | byte[] | boolean z, boolean z2 |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_votolBuildReadPage | 0x1b8b0 | 152 | byte[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_votolBuildLdget | 0x1b948 | 148 | byte[] |  |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_votolBuildShow | 0x1b9dc | 160 | byte[] | int i, int i2 |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_votolBuildHandshake | 0x1ba7c | 152 | byte[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_votolBuildWritePage | 0x1bb14 | 244 | byte[] | int i, byte[] bArr |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_votolBuildReset | 0x1bc08 | 148 | byte[] |  |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_votolBuildRemoteThrottle | 0x1bc9c | 208 | byte[] | int i, int i2, boolean z, boolean z2, boolean z3, int i3, int i4 |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_votolGetPageRaw | 0x1bd6c | 172 | byte[] | int i, int i2 |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_votolHandleData | 0x1be18 | 204 | boolean | int i, byte[] bArr |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_votolGetTelemetry | 0x1bee4 | 168 | float[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_votolGetStatus | 0x1bf8c | 168 | int[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_votolGetParams | 0x1c034 | 168 | int[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_enerkeyBuildPollCommand | 0x1c0dc | 152 | byte[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_enerkeyProcessData | 0x1c174 | 204 | boolean | int i, byte[] bArr |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_enerkeyGetHandshakeStep | 0x1c240 | 8 | int | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_sotionBuildTelemetryPoll | 0x1c248 | 148 | byte[] |  |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_sotionBuildAuthRead | 0x1c2dc | 152 | byte[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_sotionBuildAuthWrite | 0x1c374 | 152 | byte[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_sotionBuildParamRead | 0x1c40c | 152 | byte[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_sotionBuildParamWrite | 0x1c4a4 | 248 | byte[] | int i, byte[] bArr |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_sotionBuildFactoryReset | 0x1c59c | 148 | byte[] |  |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_sotionBuildSelfLearnToggle | 0x1c630 | 160 | byte[] | boolean z |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_sotionBuildDirectionToggle | 0x1c6d0 | 160 | byte[] | boolean z |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_sotionBuildSaveRestart | 0x1c770 | 148 | byte[] |  |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_sotionHandleData | 0x1c804 | 204 | boolean | int i, byte[] bArr |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_sotionGetTelemetry | 0x1c8d0 | 168 | float[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_sotionGetStatus | 0x1c978 | 168 | int[] | int i |
| Java_com_rcplusplus_fdandroid_protocol_NativeProtocol_sotionGetParamRaw | 0x1ca20 | 172 | byte[] | int i |
