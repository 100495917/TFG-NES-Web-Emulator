import { opcode_matrix } from './decode.js';    // Opcode mattrix for decoding instructions
import * as execute from './execute.js'; // Functions to execute instructions based on the addressing mode

const romInput = document.getElementById("romInput");
const loadButton = document.getElementById("loadButton");
const runButton = document.getElementById("runButton");
const stopButton = document.getElementById("stopButton");
const stepButton = document.getElementById("stepButton");
const cycleButton = document.getElementById("cycleButton");
const totalCyclesDisplay = document.getElementById("totalCycles");

export let mainMemory = new Uint8Array(0x10000); // 64KB of main CPU memory in a Uint8Array (bytes)

export let cpuRegisters = {
    a: 0, // Accumulator
    x: 0, // X Register
    y: 0, // Y Register
    pc: 0xC000, // Program Counter starts at 0xC000
    sp: 0xFF, // Stack Pointer starts at 0xFF
    // Status Register Flags, bit 7 to bit 0 are:
    // N (negative), V (overflow), - (ignored), B (break), D (decimal mode), I (interrupt disable), Z (zero), C (carry)
    status: 0
};

let currentInstructionCycles = 0;   // Cycles remaining for the current instruction to execute
let totalCycles = 0;

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

        // Remove the last 8KB of chr-rom sice it is not used by the CPU (TODO: load the CHR-ROM into PPU memory)
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

function loadRom(romData) {
    // TODO: Check ROM header for PGR-ROM size and load accordingly,
    // for now I assume roms are 16KB/32KB PGR-ROM and 8KB CHR-ROM

    const loadAddress = 0x10000 - romData.length; // Load ROM at the end of CPU memory space
    console.log(romData.length, 'bytes to load into memory.');
    console.log(`Loading ROM into memory at address 0x${loadAddress.toString(16).toUpperCase()}`);
    mainMemory.set(romData, loadAddress);
    console.log('ROM loaded into memory:', mainMemory);

    // Initialize PC with the value of the reset vector at 0xFFFC and 0xFFFD (little-endian)
    cpuRegisters.pc = mainMemory[0xFFFC] | (mainMemory[0xFFFD] << 8);
    console.log('Program Counter initialized to:', cpuRegisters.pc.toString(16).toUpperCase());

    // Initialize Stack Pointer to 0xFF (descending stack)
    cpuRegisters.sp = 0xFF;
    console.log('Stack Pointer initialized to:', cpuRegisters.sp.toString(16).toUpperCase());

    updateprogramDisplay();
    updateCpuDisplay();
    romLoaded = true;
}

function updateprogramDisplay() {
    const programDisplay = document.getElementById("program");
    programDisplay.innerHTML = "";

    // Display memory addresses of the text segment around the Program Counter (PC +- 4)
    for (let i = cpuRegisters.pc - 4; i <= cpuRegisters.pc + 4; i++) {
        const addr = `0x${i.toString(16).toUpperCase().padStart(4, '0')}`;
        const value = `0x${mainMemory[i].toString(16).toUpperCase().padStart(2, '0')}`;
        if (i === cpuRegisters.pc) {
            // Highlight the PC address with bold font and red color
            programDisplay.innerHTML += `<p style="color: red"><strong>${addr}: ${value}</strong></p>`;
        } else {
            // Rest of the memory addresses adjacent to PC  (+-4)
            programDisplay.innerHTML += `<p>${addr}: ${value}</p>`;
        }
    }
}

function updateCpuDisplay() {
    document.getElementById("A").textContent = `0x${cpuRegisters.a.toString(16).toUpperCase().padStart(2, '0')}`;
    document.getElementById("X").textContent = `0x${cpuRegisters.x.toString(16).toUpperCase().padStart(2, '0')}`;
    document.getElementById("Y").textContent = `0x${cpuRegisters.y.toString(16).toUpperCase().padStart(2, '0')}`;
    document.getElementById("PC").textContent = `0x${cpuRegisters.pc.toString(16).toUpperCase().padStart(4, '0')}`;
    document.getElementById("SP").textContent = `0x${cpuRegisters.sp.toString(16).toUpperCase().padStart(2, '0')}`;
    // Update each bit of the status register in the SR table
    for (let i = 0; i < 8; i++) {
        document.getElementById(`SR${i}`).textContent = (cpuRegisters.status & (0x01 << i)) ? '1' : '0';
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
    } while (currentInstructionCycles > 0);
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
    if (currentInstructionCycles === 0) {
        // Decode and execute the next instruction
        decodeInstruction();
        updateprogramDisplay();
        updateCpuDisplay();
    }
    currentInstructionCycles--;
    totalCycles++;
    totalCyclesDisplay.textContent = totalCycles;
}

function executeInstruction(instruction_name, addressing_mode, ...args) {
    if (typeof execute[instruction_name] === 'function') {
        // Get the function operand based on the addressing mode
        // TODO: Should the fetching of the operand be done here or before???
        const instruction_operand = execute.address_mode_handlers[addressing_mode](args);
        execute[instruction_name](instruction_operand);
    } else {
        console.error(`Function ${instruction_name} not found in execute module.`);
    }
}

function decodeInstruction() {
    const opcode = mainMemory[cpuRegisters.pc]; // Fetch
    const instruction = opcode_matrix[opcode];

    if (!instruction) {
        console.error(`Unknown opcode: 0x${opcode.toString(16).toUpperCase()}`);
        return;
    }

    console.log(`Executing instruction: ${instruction.instruction_name} with addrmode: ${instruction.addressing_mode}`);
    currentInstructionCycles = instruction.cycles;  // Set the cycles for the current instruction to finish execution

    // Update the last instruction display
    if (instruction.size === 1) {
        // Single byte instruction (only opcode)
        // Increment PC by the size of the instruction
        cpuRegisters.pc += instruction.size;
        executeInstruction(instruction.instruction_name, instruction.addressing_mode);
        document.getElementById("lastInstruction").textContent =
            `${instruction.instruction_name} (${instruction.addressing_mode})`;
    }
    else if (instruction.size === 2) {
        // Two byte instruction (opcode + one byte operand)
        const operand = mainMemory[cpuRegisters.pc + 1];
        // Increment PC by the size of the instruction
        cpuRegisters.pc += instruction.size;
        executeInstruction(instruction.instruction_name, instruction.addressing_mode, operand);
        document.getElementById("lastInstruction").textContent =
            `${instruction.instruction_name} (${instruction.addressing_mode}) 
            0x${operand.toString(16).toUpperCase().padStart(2, '0')}`;
    }
    else {
        // Three byte instruction (opcode + two byte operand)
        const operand1 = mainMemory[cpuRegisters.pc + 1];
        const operand2 = mainMemory[cpuRegisters.pc + 2];
        // Increment PC by the size of the instruction
        cpuRegisters.pc += instruction.size;
        executeInstruction(instruction.instruction_name, instruction.addressing_mode, operand1, operand2);
        document.getElementById("lastInstruction").textContent =
            `${instruction.instruction_name} (${instruction.addressing_mode}) 
            0x${operand1.toString(16).toUpperCase().padStart(2, '0')} 
            0x${operand2.toString(16).toUpperCase().padStart(2, '0')}`;
    }
}
