import { opcodeMatrix } from './decode.js';    // Opcode mattrix for decoding instructions
import * as execute from './execute.js'; // Functions to execute instructions based on the addressing mode

const romInput = document.getElementById("romInput");
const loadButton = document.getElementById("loadButton");
const runButton = document.getElementById("runButton");
const stopButton = document.getElementById("stopButton");
const stepButton = document.getElementById("stepButton");
const cycleButton = document.getElementById("cycleButton");
const totalCyclesDisplay = document.getElementById("totalCycles");

export let mainMemory = new Uint8Array(0x10000); // 64KB of main CPU memory in a Uint8Array (bytes)
export let ppuMemory = new Uint8Array(0x4000); // 16KB of PPU memory in a Uint8Array (bytes)

export let cpu = {
    a: 0, // Accumulator
    x: 0, // X Register
    y: 0, // Y Register
    pc: 0xC000, // Program Counter starts at 0xC000
    sp: 0xFF, // Stack Pointer starts at 0xFF
    // Status Register Flags, bit 7 to bit 0 are:
    // N (negative), V (overflow), - (ignored), B (break), D (decimal mode), I (interrupt disable), Z (zero), C (carry)
    status: 0,
    currentInstructionCycles: 0,    // Cycles remaining for the current instruction to execute
    totalCycles: 0, // Total cycles executed by the CPU
};

let romLoaded = false; // Flag to check if a ROM has been loaded to avoid executing instructions without a ROM

loadButton.addEventListener("click", readRom);

function readRom() {
    // Input file reading, validation and processing (removing header and last 8KB of CHR-ROM)

    const file = romInput.files[0];
    if (!file) {
        alert("Please select a ROM file.");
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        let romData = new Uint8Array(event.target.result);
        console.log('ROM data read:', romData);
        // Remove 16 bytes header if present
        if (romData[0] === 0x4E && romData[1] === 0x45 && romData[2] === 0x53 && romData[3] === 0x1A) {
            console.log('iNES file detected, removing 16 byte header.');
            romData = romData.slice(16);
        }
        console.log('ROM data after header removal:', romData);

        // Load the CHR-ROM data into PPU memory
        loadCHRRom(romData);

        // Remove the last 8KB of chr-rom sice it is not used by the CPU
        console.log('Removing last 8KB of CHR-ROM.');
        romData = romData.slice(0, -8192);
        console.log('ROM data after removing last 8KB:', romData);

        loadRom(romData);

    };
    reader.onerror = () => {
        alert("Error reading the ROM file.");
    };
    reader.readAsArrayBuffer(file);
}

function loadCHRRom(romData) {
    // Extract the last 8KB of CHR-ROM data from the ROM file
    const chrRomSize = 8192; // 8KB CHR-ROM size
    const chrRomStart = romData.length - chrRomSize;
    console.log('Extracting last 8KB of CHR-ROM from ROM data.');
    let chrRom = new Uint8Array(chrRomSize);
    chrRom.set(romData.slice(chrRomStart, romData.length)); // Get last 8KB of CHR-ROM
    console.log('CHR-ROM data:', chrRom);

    displayPatternTables(chrRom);   // Draw the pattern table pixels in the 2 HTML canvas at the left of the inteface

    // Load the CHR-ROM data into PPU memory starting at address 0
    console.log('Loading CHR-ROM into PPU memory.');
    ppuMemory.set(chrRom, 0);
    console.log('PPU memory after loading CHR-ROM:', ppuMemory);
}

function displayPatternTables(chrRom) {
    console.log('Displaying Pattern Tables.');
    const patternTable1 = document.getElementById("pattern-table1");
    const patternTable2 = document.getElementById("pattern-table2");
    const ctx1 = patternTable1.getContext("2d");
    const ctx2 = patternTable2.getContext("2d");
    const tileWidth = 8; // Each tile is 8x8 pixels
    const tileHeight = 8;
    const numTiles = 256; // 256 tiles in each pattern table
    const numCols = 16; // 16 columns of tiles in each pattern table
    // Obtain the color palette from the HTML input elements above the pattern tables
    const color0 = document.getElementById("pattern-table-color0").value;
    const color1 = document.getElementById("pattern-table-color1").value;
    const color2 = document.getElementById("pattern-table-color2").value;
    const color3 = document.getElementById("pattern-table-color3").value;
    const palette = [color0, color1, color2, color3];
    // Clear the canvas
    ctx1.clearRect(0, 0, patternTable1.width, patternTable1.height);
    ctx2.clearRect(0, 0, patternTable2.width, patternTable2.height);
    // Draw the first pattern table (first 128 bytes of CHR-ROM)
    for (let i = 0; i < numTiles; i++) {
        const tileData = chrRom.slice(i * 16, i * 16 + 16); // Each tile is 16 bytes
        const x = (i % numCols) * tileWidth;    // x coordinate of the top left corner of the tile
        const y = Math.floor(i / numCols) * tileHeight;   // y coordinate of the top left corner of the tile
        const bitPlane0 = tileData.slice(0, 8); // First 8 bytes for first bit plane
        const bitPlane1 = tileData.slice(8, 16); // Last 8 bytes for second bit plane
        for (let row = 0; row < tileHeight; row++) {
            // Each row of 8 pixels is represented by two bytes (one for each bit plane)
            const byte1 = bitPlane0[row];
            const byte2 = bitPlane1[row];
            for (let col = 0; col < tileWidth; col++) {
                // Calculate the color index based on the two bits obatined from the two bit planes
                const colorIndex = ((byte1 >> (7 - col)) & 1) | (((byte2 >> (7 - col)) & 1) << 1);
                ctx1.fillStyle = palette[colorIndex];   // Index indicates the color to choose from the 4 color palette
                ctx1.fillRect(x + col, y + row, 1, 1);
            }
        }
    }
    // Draw the second pattern table (last 128 bytes of CHR-ROM)
    for (let i = 0; i < numTiles; i++) {
        const tileData = chrRom.slice(numTiles * 16 + i * 16, numTiles * 16 + i * 16 + 16); // Each tile is 16 bytes
        const x = (i % numCols) * tileWidth;    // x coordinate of the top left corner of the tile
        const y = Math.floor(i / numCols) * tileHeight;   // y coordinate of the top left corner of the tile
        const bitPlane0 = tileData.slice(0, 8); // First 8 bytes for first bit plane
        const bitPlane1 = tileData.slice(8, 16); // Last 8 bytes for second bit plane
        for (let row = 0; row < tileHeight; row++) {
            // Each row of 8 pixels is represented by two bytes (one for each bit plane)
            const byte1 = bitPlane0[row];
            const byte2 = bitPlane1[row];
            for (let col = 0; col < tileWidth; col++) {
                // Calculate the color index based on the two bits obatined from the two bit planes
                const colorIndex = ((byte1 >> (7 - col)) & 1) | (((byte2 >> (7 - col)) & 1) << 1);
                ctx2.fillStyle = palette[colorIndex];   // Index indicates the color to choose from the 4 color palette
                ctx2.fillRect(x + col, y + row, 1, 1);
            }
        }
    }
}

function loadRom(romData) {
    // TODO: Check ROM header for PGR-ROM size and load accordingly,
    // for now I assume roms are 16KB/32KB PGR-ROM and 8KB CHR-ROM

    const loadAddress = 0x10000 - romData.length; // Load ROM at the end of CPU memory space
    console.log(romData.length, 'bytes to load into memory.');
    console.log(`Loading ROM into memory at address 0x${loadAddress.toString(16).toUpperCase()}`);
    mainMemory.set(romData, loadAddress);
    console.log('ROM loaded into memory:', mainMemory);

    // Initialize PC with the value of the reset vector at 0xFFFC and 0xFFFD (little-endian)
    cpu.pc = mainMemory[0xFFFC] | (mainMemory[0xFFFD] << 8);
    console.log('Program Counter initialized to:', cpu.pc.toString(16).toUpperCase());

    // Initialize Stack Pointer to 0xFF (descending stack)
    cpu.sp = 0xFF;
    console.log('Stack Pointer initialized to:', cpu.sp.toString(16).toUpperCase());

    updateprogramDisplay();
    updateCpuDisplay();
    romLoaded = true;
}

function updateprogramDisplay() {
    const programDisplay = document.getElementById("program");
    programDisplay.innerHTML = "";

    // Display memory addresses of the text segment around the Program Counter (PC +- 4)
    for (let i = cpu.pc - 4; i <= cpu.pc + 4; i++) {
        const addr = `0x${i.toString(16).toUpperCase().padStart(4, '0')}`;
        const value = `0x${mainMemory[i].toString(16).toUpperCase().padStart(2, '0')}`;
        if (i === cpu.pc) {
            // Highlight the PC address with bold font and red color
            programDisplay.innerHTML += `<p style="color: red"><strong>${addr}: ${value}</strong></p>`;
        } else {
            // Rest of the memory addresses adjacent to PC  (+-4)
            programDisplay.innerHTML += `<p>${addr}: ${value}</p>`;
        }
    }
}

function updateCpuDisplay() {
    document.getElementById("A").textContent = `0x${cpu.a.toString(16).toUpperCase().padStart(2, '0')}`;
    document.getElementById("X").textContent = `0x${cpu.x.toString(16).toUpperCase().padStart(2, '0')}`;
    document.getElementById("Y").textContent = `0x${cpu.y.toString(16).toUpperCase().padStart(2, '0')}`;
    document.getElementById("PC").textContent = `0x${cpu.pc.toString(16).toUpperCase().padStart(4, '0')}`;
    document.getElementById("SP").textContent = `0x${cpu.sp.toString(16).toUpperCase().padStart(2, '0')}`;
    // Update each bit of the status register in the SR table
    for (let i = 0; i < 8; i++) {
        document.getElementById(`SR${i}`).textContent = (cpu.status & (0x01 << i)) ? '1' : '0';
    }
}

let runInterval = null;

runButton.addEventListener("click", () => {
    if (!romLoaded) {
        alert("Please load a ROM before running the emulator.");
        return;
    }

    if (!runInterval) {
        // Execute CPU cycles at 1ms intervals (TODO: adjust interval for 60 FPS emulation once PPU is implemented)
        runInterval = setInterval(() => {
            cpuCycle();
            // TODO: implement PPU cycles (ppu clock frequency is 3 times the CPU clock frequency)
            // ppuCycle();
            // ppuCycle();
            // ppuCycle();
        }, 1);
    }
});

// Button to stop the execution interval loop
stopButton.addEventListener("click", () => {
    if (runInterval) {
        clearInterval(runInterval);
        runInterval = null;
    }
});

stepButton.addEventListener("click", () => {
    if (!romLoaded) {
        alert("Please load a ROM before executing instructions.");
        return;
    }
    // Run a single CPU cycle and keep executing until the current instruction is fully executed
    do {
        cpuCycle();
    } while (cpu.currentInstructionCycles > 0);
});

cycleButton.addEventListener("click", () => {
    if (!romLoaded) {
        alert("Please load a ROM before executing cycles.");
        return;
    }
    // Run a single CPU cycle
    cpuCycle();
});

// Function to execute a single CPU cycle (since instructions are not implemented at a cycle level the whole instruction
// is executed and the next calls to cpuCycle will not run a new instruction until the function is run as many times as
// the cycles needed for the instruction to finish in real hardware)
function cpuCycle() {
    if (cpu.currentInstructionCycles === 0) {
        // Decode and execute the next instruction
        decodeInstruction();
        updateprogramDisplay();
        updateCpuDisplay();
    }
    cpu.currentInstructionCycles--;
    cpu.totalCycles++;
    totalCyclesDisplay.textContent = cpu.totalCycles;
}

function executeInstruction(instructionName, addressingMode, ...args) {
    if (typeof execute[instructionName] === 'function') {
        // Get the function operand based on the addressing mode
        // TODO: Should the fetching of the operand be done here or before???
        const instructionOperand = execute.addressModeHandlers[addressingMode](args);
        execute[instructionName](instructionOperand);
    } else {
        console.error(`Function ${instructionName} not found in execute module.`);
    }
}

function decodeInstruction() {
    const opcode = mainMemory[cpu.pc]; // Fetch
    const instruction = opcodeMatrix[opcode];

    if (!instruction) {
        console.error(`Unknown opcode: 0x${opcode.toString(16).toUpperCase()}`);
        return;
    }

    console.log(`Executing instruction: ${instruction.instructionName} with addrmode: ${instruction.addressingMode}`);
    // Set the cycles for the current instruction to finish execution
    cpu.currentInstructionCycles = instruction.cycles;

    // Update the last instruction display
    if (instruction.size === 1) {
        // Single byte instruction (only opcode)
        // Increment PC by the size of the instruction
        cpu.pc += instruction.size;
        executeInstruction(instruction.instructionName, instruction.addressingMode);
        document.getElementById("lastInstruction").textContent =
            `${instruction.instructionName} (${instruction.addressingMode})`;
    }
    else if (instruction.size === 2) {
        // Two byte instruction (opcode + one byte operand)
        const operand = mainMemory[cpu.pc + 1];
        // Increment PC by the size of the instruction
        cpu.pc += instruction.size;
        executeInstruction(instruction.instructionName, instruction.addressingMode, operand);
        document.getElementById("lastInstruction").textContent =
            `${instruction.instructionName} (${instruction.addressingMode}) 
            0x${operand.toString(16).toUpperCase().padStart(2, '0')}`;
    }
    else {
        // Three byte instruction (opcode + two byte operand)
        const operand1 = mainMemory[cpu.pc + 1];
        const operand2 = mainMemory[cpu.pc + 2];
        // Increment PC by the size of the instruction
        cpu.pc += instruction.size;
        executeInstruction(instruction.instructionName, instruction.addressingMode, operand1, operand2);
        document.getElementById("lastInstruction").textContent =
            `${instruction.instructionName} (${instruction.addressingMode}) 
            0x${operand1.toString(16).toUpperCase().padStart(2, '0')} 
            0x${operand2.toString(16).toUpperCase().padStart(2, '0')}`;
    }
}
