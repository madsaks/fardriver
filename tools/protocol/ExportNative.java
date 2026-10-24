// Export local-only decompiler output and instruction listings for review.
// Run with Ghidra analyzeHeadless -postScript ExportNative.java OUTPUT_DIR.
// @category FarDriver
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;

public class ExportNative extends GhidraScript {
    public void run() throws Exception {
        Path output = Paths.get(getScriptArgs()[0]);
        Files.createDirectories(output);
        DecompInterface decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);
        int count = 0;
        try (PrintWriter index = new PrintWriter(Files.newBufferedWriter(output.resolve("functions.tsv"), StandardCharsets.UTF_8))) {
            index.println("address\tname\tdecompiled\tfile");
            FunctionIterator functions = currentProgram.getFunctionManager().getFunctions(true);
            while (functions.hasNext() && !monitor.isCancelled()) {
                Function function = functions.next();
                if (function.isExternal()) continue;
                String name = function.getName();
                String filename = function.getEntryPoint() + "_" + name.replaceAll("[^A-Za-z0-9_.-]", "_");
                DecompileResults result = decompiler.decompileFunction(function, 60, monitor);
                String content = "/* Ghidra address: 0x" + function.getEntryPoint() + "; image base: 0x" + currentProgram.getImageBase() + "; symbol: " + name + " */\n";
                content += result.decompileCompleted() ? result.getDecompiledFunction().getC() : "/* " + result.getErrorMessage() + " */\n";
                Files.write(output.resolve(filename + ".c"), content.getBytes(StandardCharsets.UTF_8));
                try (PrintWriter asm = new PrintWriter(Files.newBufferedWriter(output.resolve(filename + ".asm"), StandardCharsets.UTF_8))) {
                    InstructionIterator instructions = currentProgram.getListing().getInstructions(function.getBody(), true);
                    while (instructions.hasNext()) {
                        Instruction instruction = instructions.next();
                        asm.println(instruction.getAddress() + " " + instruction);
                    }
                }
                index.println(function.getEntryPoint() + "\t" + name + "\t" + result.decompileCompleted() + "\t" + filename + ".c");
                count++;
            }
        } finally {
            decompiler.dispose();
        }
        println("Exported " + count + " functions to " + output);
    }
}
