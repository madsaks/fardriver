from pathlib import Path

from gen_decompile_index import (
    parse_java_byte_array,
    scan_gdriver_file,
    scan_official_file,
    scan_worthless_file,
)


def test_parse_java_byte_array_handles_signed_bytes_and_casts():
    assert parse_java_byte_array("new byte[]{-120, (byte) i}") == [-120, "(byte) i"]
    assert parse_java_byte_array("new byte[]{-120, 4}") == [-120, 4]


def test_official_scanner_indexes_writeaddr_with_nearby_payload_and_label():
    text = "\n".join(
        [
            "private async void OnButtonResetClicked(object sender, EventArgs e)",
            "{",
            '  await UserDialogs.Instance.ConfirmAsync("Will Use Auto Learn Default Config", null, "Confirm", "Cancel");',
            "  SendRS232L[4] = 136;",
            "  SendRS232L[5] = 11;",
            "  WriteAddr(SendRS232L, 160, 2);",
            "}",
        ]
    )

    records = scan_official_file(
        Path("reference/decompiled/official/src/MotorNet6/MotorNet6/ProControlPage.cs"),
        text,
        line_offset=9131,
    )

    record = next(r for r in records if r["kind"] == "write_call")
    assert record["id"] == "official.ProControlPage.OnButtonResetClicked.9136"
    assert record["address"] == 160
    assert record["payload"]["bytes"] == [136, 11]
    assert "Will Use Auto Learn Default Config" in record["nearbyLabels"]


def test_official_scanner_indexes_ble_uuid_and_heb_export():
    text = "\n".join(
        [
            "private Guid commUUID = new Guid(65516, 0, 4096, new byte[8]);",
            "private async void OnExportClicked(object sender, EventArgs e)",
            "{",
            "  byte[] array = new byte[696];",
            "  App.wflash.CopyTo(array, 0);",
            "  File.WriteAllBytes(path, array);",
            "}",
        ]
    )

    records = scan_official_file(
        Path("reference/decompiled/official/src/MotorNet6/MotorNet6/ConnectPage.cs"),
        text,
        line_offset=94,
    )

    ids = {record["id"] for record in records}
    assert "official.ConnectPage.ble_uuid.94" in ids
    assert "official.ConnectPage.OnExportClicked.99" in ids


def test_worthless_scanner_indexes_native_write_and_heb_export():
    text = "\n".join(
        [
            "public final native byte[] fdBuildWritePacket(int i, byte[] bArr);",
            "ll0Var.mo4475V0(NativeProtocol.INSTANCE.fdBuildWritePacket(160, new byte[]{-120, (byte) i}));",
            'j81Var.invoke(str7 + "_" + str8 + ".heb", bArr2);',
        ]
    )

    records = scan_worthless_file(Path("reference/decompiled/worthless/jadx/sources/p000a/C0205fk.java"), text)

    write = next(r for r in records if r["kind"] == "write_call")
    assert write["operation"] == "fdBuildWritePacket"
    assert write["address"] == 160
    assert write["payload"]["bytes"] == [-120, "(byte) i"]
    assert "worthless.C0205fk.heb_export.3" in {record["id"] for record in records}


def test_gdriver_scanner_indexes_auto_learn_parser_records():
    text = "\n".join(
        [
            "r5 = {'kind': 'auto_learn_exit'};",
            "r5 = {'kind': 'auto_learn_start'};",
        ]
    )

    records = scan_gdriver_file(Path("reference/decompiled/gdriver/decompiled.js"), text)

    ids = {record["id"] for record in records}
    assert "gdriver.command_parser.auto_learn_exit" in ids
    assert "gdriver.command_parser.auto_learn_start" in ids
