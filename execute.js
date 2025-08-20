import { cpu } from './main.js';
import { mainMemory } from './main.js';

// Lookup table for addressing mode handlers an their names in the opcode matrix
export const addressModeHandlers = {
    "A": getAccumulator,
    "abs": getAbsolute,
    "abs,X": getAbsoluteX,
    "abs,Y": getAbsoluteY,
    "#": getImmediate,
    "impl": getImplied,
    "ind": getIndirect,
    "X,ind": getXIndexedIndirect,
    "ind,Y": getIndirectYIndexed,
    "rel": getRelative,
    "zpg": getZeropage,
    "zpg,X": getZeropageXIndexed,
    "zpg,Y": getZeropageYIndexed
};

// Functions to handle the fetching of the operand based on the addressing mode of the instruction
// Addressing modes as described in https://www.masswerk.at/6502/6502_instruction_set.html:
/*
A	    Accumulator	                OPC A	        operand is AC (implied single byte instruction)
abs	    absolute	                OPC $LLHH	    operand is address $HHLL *
abs,X	absolute, X-indexed         OPC $LLHH,X	    operand is address;
                                                    effective address is address incremented by X with carry **
abs,Y	absolute, Y-indexed	        OPC $LLHH,Y	    operand is address;
                                                    effective address is address incremented by Y with carry **
#	    immediate	                OPC #$BB	    operand is byte BB
impl	implied	                    OPC	            operand implied
ind	    indirect	                OPC ($LLHH)	    operand is address;
                                                    effective address is contents of word at address: C.w($HHLL)
X,ind	X-indexed, indirect	        OPC ($LL,X)	    operand is zeropage address;
                                                    effective address is word in (LL + X, LL + X + 1),
                                                    incremented without carry: C.w($00LL + X)
ind,Y	indirect, Y-indexed	        OPC ($LL),Y	    operand is zeropage address;
                                                    effective address is word in (LL, LL + 1)
                                                    incremented by Y with carry: C.w($00LL) + Y
rel	    relative	                OPC $BB	        branch target is PC + signed offset BB ***
zpg	    zeropage	                OPC $LL	        operand is zeropage address (hi-byte is zero, address = $00LL)
zpg,X	zeropage, X-indexed	        OPC $LL,X	    operand is zeropage address;
                                                    effective address is address incremented by X without carry **
zpg,Y	zeropage, Y-indexed	        OPC $LL,Y	    operand is zeropage address;
                                                    effective address is address incremented by Y without carry **
*/

export function getAccumulator() {
    /*
    OPC A
    operand is AC (implied single byte instruction)
    Return a constant string that will be handled in instructions that admit Accumulator addressing
    */
    return "accumulator";
}

export function getAbsolute(operand1, operand2) {
    /*
    OPC $LLHH
    operand is 16 bit address $HHLL
    Return the 16-bit address formed by combining the two bytes after shifting the second byte left by 8 bits
    */
    return ((operand2 << 8) | operand1);
}

export function getAbsoluteX(operand1, operand2) {
    /*
    OPC $LLHH,X
    operand is address; effective address is address incremented by X with carry
    Return the 16-bit address formed by combining the two bytes after shifting the second left by 8 bits and adding X
    */
    const lowerByte = operand1 + cpu.x; // Add X to the lower byte
    // Since read instructions that use Absolute X addressing mode have a 1 cycle penalty if the page boundary is
    // crossed due to having to perform an extra read, we need to check if the addition of X to the low byte of the base
    // address causes a carry
    const carry = (lowerByte > 0xFF) ? 1 : 0; // Check if there is a carry (page boundary crossed)
    const higherByte = (operand2 + carry) & 0xFF; // Add carry to the higher byte in case of page boundary crossing
    // Combine the two bytes to form the address
    const effectiveAddress = ((higherByte << 8) | (lowerByte & 0xFF)) & 0xFFFF; // Ensure it wraps around at 0xFFFF
    // Return the effective address and carry (1 if page boundary crossed, 0 otherwise)
    return { effectiveAddress, carry };
}

export function getAbsoluteY(operand1, operand2) {
    /*
    OPC $LLHH,Y
    operand is address; effective address is address incremented by Y with carry
    Return the 16-bit address formed by combining the two bytes after shifting the second left by 8 bits and adding Y
    */
    const lowerByte = operand1 + cpu.y; // Add Y to the lower byte
    // Since read instructions that use Absolute Y addressing mode have a 1 cycle penalty if the page boundary is
    // crossed due to having to perform an extra read, we need to check if the addition of Y to the low byte of the base
    // address causes a carry
    const carry = (lowerByte > 0xFF) ? 1 : 0; // Check if there is a carry (page boundary crossed)
    const higherByte = (operand2 + carry) & 0xFF; // Add carry to the higher byte in case of page boundary crossing
    // Combine the two bytes to form the address
    const effectiveAddress = ((higherByte << 8) | (lowerByte & 0xFF)) & 0xFFFF; // Ensure it wraps around at 0xFFFF
    // Return the effective address and carry (1 if page boundary crossed, 0 otherwise)
    return { effectiveAddress, carry };
}

export function getImmediate() {
    /*
    OPC #$BB
    operand is byte BB*
    Return the address of the immediate value (PC-1 since we increment PC+2 before execution)
    *Note:  This is done to keep consistency in the get functions to always return addresses so that no distinction
            needs to be made between addressing modes in the instruction handlers
    */
    return (cpu.pc - 1) & 0xFFFF;
}

export function getImplied() {
    /*
    OPC
    operand implied
    Return null since Implied addressing instructions do not require an operand
    */
    return null;
}

export function getIndirect(operand1, operand2) {
    /*
    OPC ($LLHH)
    operand is address; effective address is contents of word at address: C.w($HHLL)
    return the 16 bit address obtained from the memory address formed by combining the two bytes after shifting the
    second byte left by 8 bits
    */
    const addressL = ((operand2 << 8) | operand1) & 0xFFFF; // Address of the LSB of the word
    // Note: In the address of the high byte the LSB (operand1) is wrapped around at 0xFF to replicate a hardware bug
    // in the 6502 where the in a page boundary were incorrectly fecthed as explained in
    // http://www.6502.org/users/obelisk/6502/reference.html#JMP
    const addressH = ((operand2 << 8) | ((operand1 + 1) & 0xFF)) & 0xFFFF; // Address of the MSB of the word
    // Read the word from memory and shift the MSB left by 8 bits
    return ((mainMemory[addressH] << 8) | mainMemory[addressL]) & 0xFFFF;
}

export function getXIndexedIndirect(operand) {
    /*
    OPC ($LL,X)
    operand is zeropage address; effective address is word in (LL + X, LL + X + 1), inc. without carry: C.w($00LL + X)
    return the 16 bit address obtained from memory address formed by adding X to the zeropage address operand
    */
    const address = (operand + cpu.x) & 0xFF; // Address of the LSB of the word
    // Read the word from memory and shift the MSB (at address+1) left by 8 bits
    return (mainMemory[address] | (mainMemory[(address + 1) & 0xFF] << 8)) & 0xFFFF;
}

export function getIndirectYIndexed(operand) {
    /*
    OPC ($LL),Y
    operand is zeropage address; effective address is word in (LL, LL + 1) incremented by Y with carry: C.w($00LL) + Y
    return the 16 bit address obtained from the zeropage memory address and adding to it the contents of Y
    */
    const address = operand & 0xFF; // Address of the LSB of the word
    const lowerByte = mainMemory[address] + cpu.y; // Add Y to the lower byte
    // Since read instructions that use (Indirect) Y addressing mode have a 1 cycle penalty if the page boundary is
    // crossed due to having to perform an extra read, we need to check if the addition of Y to the low byte of the base
    // address causes a carry
    const carry = (lowerByte > 0xFF) ? 1 : 0; // Check if there is a carry (page boundary crossed)
    // Add carry to the higher byte in case of page boundary crossing
    const higherByte = (mainMemory[(address + 1) & 0xFF] + carry) & 0xFF;
    // Combine the two bytes to form the address
    const effectiveAddress = ((higherByte << 8) | (lowerByte & 0xFF)) & 0xFFFF; // Ensure it wraps around at 0xFFFF
    // Return the effective address and carry (1 if page boundary crossed, 0 otherwise)
    return { effectiveAddress, carry };
}

export function getRelative(operand) {
    /*
    OPC $BB
    branch target is PC + signed offset BB
    return the displacement to be applied to PC in case of taking the branch as a signed number
    (to avoid having to translate from 2s complement to signed in every branch function)
    */
    return (operand & 0x80) ? (operand - 256) : operand; // Convert to signed value
}

export function getZeropage(operand) {
    /*
    OPC $LL
    operand is zeropage address (hi-byte is zero, address = $00LL)
    return the zeropage address as a single byte
    */
    return operand & 0xFF; // Ensure it is a single byte
}

export function getZeropageXIndexed(operand) {
    /*
    OPC $LL,X
    operand is zeropage address; effective address is address incremented by X without carry
    return the zeropage address calculated by adding the byte operand to the value of register X
    (The address calculation wraps around if the sum of the base address and the register exceed $FF)
    */
    return (operand + cpu.x) & 0xFF;
}

export function getZeropageYIndexed(operand) {
    /*
    OPC $LL,Y
    operand is zeropage address; effective address is address incremented by Y without carry
    return the zeropage address calculated by adding the byte operand to the value of register Y
    (The address calculation wraps around if the sum of the base address and the register exceed $FF)
    */
    return (operand + cpu.y) & 0xFF;
}

// Functions to handle the execution of instructions

export function ADC(memoryLocation) {
    /*
    Add with Carry
    A,Z,C,N = A+M+C
    This instruction adds the contents of a memory location to the accumulator together with the carry bit.
    If overflow occurs the carry bit is set, this enables multiple byte addition to be performed.
    http://www.6502.org/users/obelisk/6502/reference.html#ADC
    Note: The original 6502 does support decimal mode for this instruction, but the NES 6502 does not,
    so it is not implemented here.
    */
    if (typeof memoryLocation === "object") {
        // If memoryLocation is an object it was returned by getAbsoluteX, getAbsoluteY or getIndirectYIndexed
        // Destructure the object to get the address and page crossing flag
        const { effectiveAddress, pageCrossed } = memoryLocation;
        // If pageCrossed is true, it means the effective address crosses a page boundary
        if (pageCrossed) {
            cpu.currentInstructionCycles += 1; // Add an extra cycle if the page boundary is crossed
        }
        memoryLocation = effectiveAddress; // Use the effective address for the operation
    }

    const value = mainMemory[memoryLocation];
    const carry = (cpu.status & 0x01) ? 1 : 0;
    let result = cpu.a + value + carry; // Add accumulator, value of memoryLocation and carry
    // Set carry flag if overflow in bit 7
    cpu.status = (result > 0xFF) ? (cpu.status | 0x01) : (cpu.status & ~0x01);
    result &= 0xFF; // Save only the lower byte (ignore carry) to keep the 2's complement representation of the result

    // When adding 2's complement numbers an overflow happens if A and M have the same sign but the sign of the result
    // is different. Doing an XOR with the 7th bit of 2 values will result in 0 if they have the same sign and 0x80 if
    // their sign is different
    if ((((cpu.a ^ value) & 0x80) === 0) && (((cpu.a ^ result) & 0x80) !== 0)) {
        cpu.status |= 0x40;    // Set overflow flag if overflow occurs
    } else {
        cpu.status &= ~0x40;   // Clear overflow flag if no overflow
    }
    cpu.a = result;
    // Set zero flag if result is zero
    cpu.status = (cpu.a === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpu.status = (cpu.a & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function AND(memoryLocation) {
    /*
    Logical AND
    A,Z,N = A&M
    A logical AND is performed, bit by bit, on the accumulator contents using the contents of a byte of memory.
    http://www.6502.org/users/obelisk/6502/reference.html#AND
    */
    if (typeof memoryLocation === "object") {
        // If memoryLocation is an object it was returned by getAbsoluteX, getAbsoluteY or getIndirectYIndexed
        // Destructure the object to get the address and page crossing flag
        const { effectiveAddress, pageCrossed } = memoryLocation;
        // If pageCrossed is true, it means the effective address crosses a page boundary
        if (pageCrossed) {
            cpu.currentInstructionCycles += 1; // Add an extra cycle if the page boundary is crossed
        }
        memoryLocation = effectiveAddress; // Use the effective address for the operation
    }

    const value = mainMemory[memoryLocation];
    cpu.a &= value; // Perform AND operation
    // Set zero flag if result is zero
    cpu.status = (cpu.a === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpu.status = (cpu.a & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function ASL(memoryLocation) {
    /*
    Arithmetic Shift Left
    A,Z,C,N = M*2 or M,Z,C,N = M*2
    This operation shifts all the bits of the accumulator or memory contents one bit left.
    Bit 0 is set to 0 and bit 7 is placed in the carry flag.
    The effect of this operation is to multiply the memory contents by 2 (ignoring 2's complement considerations),
    setting the carry if the result will not fit in 8 bits.
    http://www.6502.org/users/obelisk/6502/reference.html#ASL
    */
    // ASL admits Absolute,X addressing but it applies no cycle penalty for page crossing, so we just obtain the
    // effective address from the object returned by the getAbsoluteX function and ignore the page crossing flag
    if (typeof memoryLocation === "object") {
        // If memoryLocation is an object it was returned by getAbsoluteX, getAbsoluteY or getIndirectYIndexed
        // Destructure the object to get the address (ignore page crossing flag)
        const { effectiveAddress } = memoryLocation;
        memoryLocation = effectiveAddress; // Use the effective address for the operation
    }

    // When the instruction has no arguments (1 byte instruction) the operation is performed on the accumulator
    if (memoryLocation === "accumulator") {
        // Set carry flag if bit 7 is set
        cpu.status = (cpu.a & 0x80) ? (cpu.status | 0x01) : (cpu.status & ~0x01);
        // Shift one bit left and store only the lower byte (ignore carry)
        cpu.a = (cpu.a << 1) & 0xFF;
        // Set zero flag if result is zero
        cpu.status = (cpu.a === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
        // Set negative flag if bit 7 of the result is set
        cpu.status = (cpu.a & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
    } else {    // Operation is done on the contents of memoryLocation
        const value = mainMemory[memoryLocation];
        // Set carry flag if bit 7 is set
        cpu.status = (value & 0x80) ? (cpu.status | 0x01) : (cpu.status & ~0x01);
        // Shift one bit left and store only the lower byte (ignore carry)
        mainMemory[memoryLocation] = (value << 1) & 0xFF;
        // Set zero flag if result is zero
        cpu.status =
            (mainMemory[memoryLocation] === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
        // Set negative flag if bit 7 of the result is set
        cpu.status =
            (mainMemory[memoryLocation] & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
    }
}

export function BCC(displacement) {
    /*
    Branch if Carry Clear
    If the carry flag is clear then add the relative displacement to the program counter to cause a branch to
    a new location.
    http://www.6502.org/users/obelisk/6502/reference.html#BCC
    */
    if (!(cpu.status & 0x01)) { // Check if carry flag is clear
        cpu.currentInstructionCycles += 1; // Instruction takes an extra cycle if the branch is taken
        const newPC = cpu.pc + displacement; // Calculate program counter after branch
        if ((cpu.pc & 0xFF00) !== (newPC & 0xFF00)) {
            // Instruction takes an extra cycle if the branch crosses a page boundary (High byte of PC changes)
            cpu.currentInstructionCycles += 1;
        }
        cpu.pc = newPC & 0xFFFF; // Update program counter, ensuring it wraps around at 0xFFFF
    }
}

export function BCS(displacement) {
    /*
    Branch if Carry Set
    If the carry flag is set then add the relative displacement to the program counter to cause a branch to
    a new location.
    http://www.6502.org/users/obelisk/6502/reference.html#BCS
    */
    if (cpu.status & 0x01) { // Check if carry flag is set
        cpu.currentInstructionCycles += 1; // Instruction takes an extra cycle if the branch is taken
        const newPC = cpu.pc + displacement; // Calculate program counter after branch
        if ((cpu.pc & 0xFF00) !== (newPC & 0xFF00)) {
            // Instruction takes an extra cycle if the branch crosses a page boundary (High byte of PC changes)
            cpu.currentInstructionCycles += 1;
        }
        cpu.pc = newPC & 0xFFFF; // Update program counter, ensuring it wraps around at 0xFFFF
    }
}

export function BEQ(displacement) {
    /*
    Branch if Equal
    If the zero flag is set then add the relative displacement to the program counter to cause a branch to
    a new location.
    http://www.6502.org/users/obelisk/6502/reference.html#BEQ
    */
    if (cpu.status & 0x02) { // Check if zero flag is set
        cpu.currentInstructionCycles += 1; // Instruction takes an extra cycle if the branch is taken
        const newPC = cpu.pc + displacement; // Calculate program counter after branch
        if ((cpu.pc & 0xFF00) !== (newPC & 0xFF00)) {
            // Instruction takes an extra cycle if the branch crosses a page boundary (High byte of PC changes)
            cpu.currentInstructionCycles += 1;
        }
        cpu.pc = newPC & 0xFFFF; // Update program counter, ensuring it wraps around at 0xFFFF
    }
}

export function BIT(memoryLocation) {
    /*
    Bit Test
    Z = A & M, N = M7, V = M6
    This instructions is used to test if one or more bits are set in a target memory location.
    The mask pattern in A is ANDed with the value in memory to set or clear the zero flag,
    but the result is not kept. Bits 7 and 6 of the value from memory are copied into the N and V flags.
    http://www.6502.org/users/obelisk/6502/reference.html#BIT
    */
    const value = mainMemory[memoryLocation];
    const result = cpu.a & value;

    // Set zero flag if result is zero
    cpu.status = (result === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Copy bit 7 of value to negative flag
    cpu.status = (value & 0x08) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
    // Copy bit 6 of value to overflow flag
    cpu.status = (value & 0x40) ? (cpu.status | 0x40) : (cpu.status & ~0x40);
}

export function BMI(displacement) {
    /*
    Branch if Minus
    If the negative flag is set then add the relative displacement to the program counter to cause a branch to
    a new location.
    http://www.6502.org/users/obelisk/6502/reference.html#BMI
    */
    if (cpu.status & 0x80) { // Check if negative flag is set
        cpu.currentInstructionCycles += 1; // Instruction takes an extra cycle if the branch is taken
        const newPC = cpu.pc + displacement; // Calculate program counter after branch
        if ((cpu.pc & 0xFF00) !== (newPC & 0xFF00)) {
            // Instruction takes an extra cycle if the branch crosses a page boundary (High byte of PC changes)
            cpu.currentInstructionCycles += 1;
        }
        cpu.pc = newPC & 0xFFFF; // Update program counter, ensuring it wraps around at 0xFFFF
    }
}

export function BNE(displacement) {
    /*
    Branch if Not Equal
    If the zero flag is clear then add the relative displacement to the program counter to cause a branch to
    a new location.
    http://www.6502.org/users/obelisk/6502/reference.html#BNE
    */
    if (!(cpu.status & 0x02)) { // Check if zero flag is clear
        cpu.currentInstructionCycles += 1; // Instruction takes an extra cycle if the branch is taken
        const newPC = cpu.pc + displacement; // Calculate program counter after branch
        if ((cpu.pc & 0xFF00) !== (newPC & 0xFF00)) {
            // Instruction takes an extra cycle if the branch crosses a page boundary (High byte of PC changes)
            cpu.currentInstructionCycles += 1;
        }
        cpu.pc = newPC & 0xFFFF; // Update program counter, ensuring it wraps around at 0xFFFF
    }
}

export function BPL(displacement) {
    /*
    Branch if Minus
    If the negative flag is clear then add the relative displacement to the program counter to cause a branch to
    a new location.
    http://www.6502.org/users/obelisk/6502/reference.html#BPL
    */
    if (!(cpu.status & 0x80)) { // Check if negative flag is clear
        cpu.currentInstructionCycles += 1; // Instruction takes an extra cycle if the branch is taken
        const newPC = cpu.pc + displacement; // Calculate program counter after branch
        if ((cpu.pc & 0xFF00) !== (newPC & 0xFF00)) {
            // Instruction takes an extra cycle if the branch crosses a page boundary (High byte of PC changes)
            cpu.currentInstructionCycles += 1;
        }
        cpu.pc = newPC & 0xFFFF; // Update program counter, ensuring it wraps around at 0xFFFF
    }
}

export function BRK() {
    /*
    Force Interrupt
    The BRK instruction forces the generation of an interrupt request. The program counter and processor status are
    pushed on the stack then the IRQ interrupt vector at $FFFE/F is loaded into the PC and the break flag
    in the status set to one.
    http://www.6502.org/users/obelisk/6502/reference.html#BRK
    */
    // The stack is located between 0x01FF-0x0100, grows downwards and is an empty stack
    // (the stack pointer points to the element where the next value will be stored)
    // The stack pointer is an 8-bit resgister that contains the LSB of the stack address (0x0100 + SP)
    // https://www.nesdev.org/wiki/Stack
    // There is always a padding byte after BRK instructions so the return address is the current PC + 1
    // (second byte after BRK)
    const returnAddress = (cpu.pc + 1) & 0xFFFF;
    // Note: I found no reference to the order in which PC + 1 is pushed (HHLL or LLHH), but
    //       https://mirrors.apple2.org.za/ftp.apple.asimov.net/documentation/hardware/processors/MCS6500%20Family%20Programming%20Manual.pdf
    //       states that in the RTI instruction the return address is popped in the order LL HH, so I will assume that
    //       BRK pushes it in order HH LL
    mainMemory[0x0100 + cpu.sp] = (returnAddress >> 8) & 0xFF; // Push high byte of return address
    cpu.sp = (cpu.sp - 1) & 0xFF; // Decrement stack pointer
    mainMemory[0x0100 + cpu.sp] = returnAddress & 0xFF; // Push low byte of return address
    cpu.sp = (cpu.sp - 1) & 0xFF; // Decrement stack pointer
    cpu.status |= 0x10; // Set break flag (bit 4) in status register
    mainMemory[0x0100 + cpu.sp] = cpu.status; // Push status register
    cpu.sp = (cpu.sp - 1) & 0xFF; // Decrement stack pointer

    const interruptAddressLow = mainMemory[0xFFFE]; // Read low byte of IRQ interrupt vector
    const interruptAddressHigh = mainMemory[0xFFFF]; // Read high byte of IRQ interrupt vector
    // Combine the two bytes to form the address
    const interruptHandlerAddress = (interruptAddressHigh << 8) | interruptAddressLow;
    cpu.pc = interruptHandlerAddress & 0xFFFF; // Set PC to the target memory address
}

export function BVC(displacement) {
    /*
    Branch if Overflow Clear
    If the overflow flag is clear then add the relative displacement to the program counter to cause a branch to
    a new location.
    http://www.6502.org/users/obelisk/6502/reference.html#BVC
    */
    if (!(cpu.status & 0x04)) { // Check if overflow flag is clear
        cpu.currentInstructionCycles += 1; // Instruction takes an extra cycle if the branch is taken
        const newPC = cpu.pc + displacement; // Calculate program counter after branch
        if ((cpu.pc & 0xFF00) !== (newPC & 0xFF00)) {
            // Instruction takes an extra cycle if the branch crosses a page boundary (High byte of PC changes)
            cpu.currentInstructionCycles += 1;
        }
        cpu.pc = newPC & 0xFFFF; // Update program counter, ensuring it wraps around at 0xFFFF
    }
}

export function BVS(displacement) {
    /*
    Branch if Overflow Set
    If the overflow flag is set then add the relative displacement to the program counter to cause a branch to
    a new location.
    http://www.6502.org/users/obelisk/6502/reference.html#BVS
    */
    if (cpu.status & 0x04) { // Check if overflow flag is set
        cpu.currentInstructionCycles += 1; // Instruction takes an extra cycle if the branch is taken
        const newPC = cpu.pc + displacement; // Calculate program counter after branch
        if ((cpu.pc & 0xFF00) !== (newPC & 0xFF00)) {
            // Instruction takes an extra cycle if the branch crosses a page boundary (High byte of PC changes)
            cpu.currentInstructionCycles += 1;
        }
        cpu.pc = newPC & 0xFFFF; // Update program counter, ensuring it wraps around at 0xFFFF
    }
}

export function CLC() {
    /*
    Clear Carry Flag
    C = 0
    Set the carry flag to zero.
    http://www.6502.org/users/obelisk/6502/reference.html#CLC
    */
    cpu.status = cpu.status & ~0x01; // Clear bit 0 (carry flag)
}

export function CLD() {
    /*
    Clear Decimal Mode
    D = 0
    Set the decimal mode flag to zero.
    http://www.6502.org/users/obelisk/6502/reference.html#CLD
    */
    cpu.status = cpu.status & ~0x08; // Clear bit 3 (decimal mode flag)
}

export function CLI() {
    /*
    Clear Interrupt Disable
    I = 0
    Clears the interrupt disable flag allowing normal interrupt requests to be serviced.
    http://www.6502.org/users/obelisk/6502/reference.html#CLI
    */
    cpu.status = cpu.status & ~0x04; // Clear bit 2 (interrupt disable flag)
}

export function CLV() {
    /*
    Clear Overflow Flag
    V = 0
    Clears the overflow flag.
    http://www.6502.org/users/obelisk/6502/reference.html#CLV
    */
    cpu.status = cpu.status & ~0x40; // Clear bit 6 (overflow flag)
}

export function CMP(memoryLocation) {
    /*
    Compare
    Z,C,N = A-M
    This instruction compares the contents of the accumulator with another memory held value and sets the zero and
    carry flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#CMP
    */
    if (typeof memoryLocation === "object") {
        // If memoryLocation is an object it was returned by getAbsoluteX, getAbsoluteY or getIndirectYIndexed
        // Destructure the object to get the address and page crossing flag
        const { effectiveAddress, pageCrossed } = memoryLocation;
        // If pageCrossed is true, it means the effective address crosses a page boundary
        if (pageCrossed) {
            cpu.currentInstructionCycles += 1; // Add an extra cycle if the page boundary is crossed
        }
        memoryLocation = effectiveAddress; // Use the effective address for the operation
    }

    const value = mainMemory[memoryLocation];
    const result = (cpu.a - value) & 0xFF; // Subtract memory value from accumulator
    // Set carry flag if result is non-negative (A >= M)
    cpu.status = (result >= 0) ? (cpu.status | 0x01) : (cpu.status & ~0x01);
    // Set zero flag if result is zero (A === M)
    cpu.status = (result === 0) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpu.status = (result & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function CPX(memoryLocation) {
    /*
    Compare X Register
    Z,C,N = X-M
    This instruction compares the contents of the X register with another memory held value and sets the zero and
    carry flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#CPX
    */
    const value = mainMemory[memoryLocation];
    const result = (cpu.x - value) & 0xFF; // Subtract memory value from X register
    // Set carry flag if result is non-negative (A >= M)
    cpu.status = (result >= 0) ? (cpu.status | 0x01) : (cpu.status & ~0x01);
    // Set zero flag if result is zero (A === M)
    cpu.status = (result === 0) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpu.status = (result & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function CPY(memoryLocation) {
    /*
    Compare Y Register
    Z,C,N = Y-M
    This instruction compares the contents of the Y register with another memory held value and sets the zero and
    carry flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#CPY
    */
    const value = mainMemory[memoryLocation];
    const result = (cpu.y - value) & 0xFF; // Subtract memory value from Y register
    // Set carry flag if result is non-negative (A >= M)
    cpu.status = (result >= 0) ? (cpu.status | 0x01) : (cpu.status & ~0x01);
    // Set zero flag if result is zero (A === M)
    cpu.status = (result === 0) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpu.status = (result & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function DEC(memoryLocation) {
    /*
    Decrement Memory
    M,Z,N = M-1
    Subtracts one from the value held at a specified memory location setting the zero and negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#DEC
    */
    // DEC admits Absolute,X addressing but it applies no cycle penalty for page crossing, so we just obtain the
    // effective address from the object returned by the getAbsoluteX function and ignore the page crossing flag
    if (typeof memoryLocation === "object") {
        // If memoryLocation is an object it was returned by getAbsoluteX, getAbsoluteY or getIndirectYIndexed
        // Destructure the object to get the address (ignore page crossing flag)
        const { effectiveAddress } = memoryLocation;
        memoryLocation = effectiveAddress; // Use the effective address for the operation
    }

    const value = mainMemory[memoryLocation];
    const result = (value - 1) & 0xFF; // Subtract 1 from memory value (wraps around from 0x00 to 0xFF)
    mainMemory[memoryLocation] = result; // Store result in original memory location
    // Set zero flag if result is zero
    cpu.status = (result === 0) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpu.status = (result & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function DEX() {
    /*
    Decrement X Register
    X,Z,N = X-1
    Subtracts one from the X register setting the zero and negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#DEX
    */
    const result = (cpu.x - 1) & 0xFF; // Subtract 1 from X register (wraps around from 0x00 to 0xFF)
    cpu.x = result; // Store result in X register
    // Set zero flag if result is zero
    cpu.status = (result === 0) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpu.status = (result & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function DEY() {
    /*
    Decrement Y Register
    Y,Z,N = Y-1
    Subtracts one from the Y register setting the zero and negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#DEY
    */
    const result = (cpu.y - 1) & 0xFF; // Subtract 1 from Y register (wraps around from 0x00 to 0xFF)
    cpu.y = result; // Store result in Y register
    // Set zero flag if result is zero
    cpu.status = (result === 0) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpu.status = (result & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function EOR(memoryLocation) {
    /*
    Exclusive OR
    A,Z,N = A^M
    An exclusive OR is performed, bit by bit, on the accumulator contents using the contents of a byte of memory.
    http://www.6502.org/users/obelisk/6502/reference.html#EOR
    */
    if (typeof memoryLocation === "object") {
        // If memoryLocation is an object it was returned by getAbsoluteX, getAbsoluteY or getIndirectYIndexed
        // Destructure the object to get the address and page crossing flag
        const { effectiveAddress, pageCrossed } = memoryLocation;
        // If pageCrossed is true, it means the effective address crosses a page boundary
        if (pageCrossed) {
            cpu.currentInstructionCycles += 1; // Add an extra cycle if the page boundary is crossed
        }
        memoryLocation = effectiveAddress; // Use the effective address for the operation
    }

    const value = mainMemory[memoryLocation];
    cpu.a ^= value; // Perform XOR operation
    // Set zero flag if result is zero
    cpu.status = (cpu.a === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpu.status = (cpu.a & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function INC(memoryLocation) {
    /*
    Increment Memory
    M,Z,N = M+1
    Adds one to the value held at a specified memory location setting the zero and negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#INC
    */
    // INC admits Absolute,X addressing but it applies no cycle penalty for page crossing, so we just obtain the
    // effective address from the object returned by the getAbsoluteX function and ignore the page crossing flag
    if (typeof memoryLocation === "object") {
        // If memoryLocation is an object it was returned by getAbsoluteX, getAbsoluteY or getIndirectYIndexed
        // Destructure the object to get the address (ignore page crossing flag)
        const { effectiveAddress } = memoryLocation;
        memoryLocation = effectiveAddress; // Use the effective address for the operation
    }

    const value = mainMemory[memoryLocation];
    const result = (value + 1) & 0xFF; // Subtract 1 from memory value (wraps around from 0xFF to 0x00)
    mainMemory[memoryLocation] = result; // Store result in original memory location
    // Set zero flag if result is zero
    cpu.status = (result === 0) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpu.status = (result & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function INX() {
    /*
    Increment X Register
    X,Z,N = X+1
    Adds one to the X register setting the zero and negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#INX
    */
    const result = (cpu.x - 1) & 0xFF; // Subtract 1 from X register (wraps around from 0x00 to 0xFF)
    cpu.x = result; // Store result in X register
    // Set zero flag if result is zero
    cpu.status = (result === 0) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpu.status = (result & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function INY() {
    /*
    Increment Y Register
    Y,Z,N = Y+1
    Adds one to the Y register setting the zero and negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#INY
    */
    const result = (cpu.y - 1) & 0xFF; // Subtract 1 from Y register (wraps around from 0x00 to 0xFF)
    cpu.y = result; // Store result in Y register
    // Set zero flag if result is zero
    cpu.status = (result === 0) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpu.status = (result & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function JMP(memoryLocation) {
    /*
    Jump
    PC = $HHLL
    Sets the program counter to the address specified by the operand.
    http://www.6502.org/users/obelisk/6502/reference.html#JMP
    */
    cpu.pc = memoryLocation & 0xFFFF; // Ensure it wraparound at 0xFFFF
}

export function JSR(memoryLocation) {
    /*
    Jump to Subroutine
    The JSR instruction pushes the address (minus one) of the return point on to the stack and then sets the
    program counter to the target memory address.
    http://www.6502.org/users/obelisk/6502/reference.html#JSR
    */
    // The 6502 stores the return address minus one (last byte of the JSR isntruction) on the stack
    // This is because of the internal working of the 6502, which stores the current PC before fetching
    // the last byte of the JSR instruction, as seen in
    // 1976 MCS 6500 Family Programming Manual (*1) in section 8.1 JSR - Jump to Subroutine p.106..109
    // https://archive.org/details/6500-50a_mcs6500pgmmanjan76/page/n121/mode/2up?view=theater
    const returnAddress = (cpu.pc - 1) & 0xFFFF;

    // The stack is located between 0x01FF-0x0100, grows downwards and is an empty stack
    // (the stack pointer points to the element where the next value will be stored)
    // The stack pointer is an 8-bit resgister that contains the LSB of the stack address (0x0100 + SP)
    // https://www.nesdev.org/wiki/Stack
    mainMemory[0x0100 + cpu.sp] = (returnAddress >> 8) & 0xFF; // Push high byte of return address
    cpu.sp = (cpu.sp - 1) & 0xFF; // Decrement stack pointer
    mainMemory[0x0100 + cpu.sp] = returnAddress & 0xFF; // Push low byte of return address
    cpu.sp = (cpu.sp - 1) & 0xFF; // Decrement stack pointer
    cpu.pc = memoryLocation & 0xFFFF; // Set PC to the target memory address
}

export function LDA(memoryLocation) {
    /*
    Load Accumulator
    A,Z,N = M
    Loads a byte of memory into the accumulator setting the zero and negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#LDA
    */
    if (typeof memoryLocation === "object") {
        // If memoryLocation is an object it was returned by getAbsoluteX, getAbsoluteY or getIndirectYIndexed
        // Destructure the object to get the address and page crossing flag
        const { effectiveAddress, pageCrossed } = memoryLocation;
        // If pageCrossed is true, it means the effective address crosses a page boundary
        if (pageCrossed) {
            cpu.currentInstructionCycles += 1; // Add an extra cycle if the page boundary is crossed
        }
        memoryLocation = effectiveAddress; // Use the effective address for the operation
    }

    const value = mainMemory[memoryLocation];
    cpu.a = value; // Store in accumulator
    // Set zero flag if value stored is zero
    cpu.status = (cpu.a === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the value stored is set
    cpu.status = (cpu.a & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function LDX(memoryLocation) {
    /*
    Load X Register
    X,Z,N = M
    Loads a byte of memory into the X register setting the zero and negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#LDX
    */
    if (typeof memoryLocation === "object") {
        // If memoryLocation is an object it was returned by getAbsoluteY
        // Destructure the object to get the address and page crossing flag
        const { effectiveAddress, pageCrossed } = memoryLocation;
        // If pageCrossed is true, it means the effective address crosses a page boundary
        if (pageCrossed) {
            cpu.currentInstructionCycles += 1; // Add an extra cycle if the page boundary is crossed
        }
        memoryLocation = effectiveAddress; // Use the effective address for the operation
    }

    const value = mainMemory[memoryLocation];
    cpu.x = value; // Store in X register
    // Set zero flag if value stored is zero
    cpu.status = (cpu.x === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the value stored is set
    cpu.status = (cpu.x & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function LDY(memoryLocation) {
    /*
    Load Y Register
    Y,Z,N = M
    Loads a byte of memory into the Y register setting the zero and negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#LDY
    */
    if (typeof memoryLocation === "object") {
        // If memoryLocation is an object it was returned by getAbsoluteX
        // Destructure the object to get the address and page crossing flag
        const { effectiveAddress, pageCrossed } = memoryLocation;
        // If pageCrossed is true, it means the effective address crosses a page boundary
        if (pageCrossed) {
            cpu.currentInstructionCycles += 1; // Add an extra cycle if the page boundary is crossed
        }
        memoryLocation = effectiveAddress; // Use the effective address for the operation
    }

    const value = mainMemory[memoryLocation];
    cpu.y = value; // Store in Y register
    // Set zero flag if value stored is zero
    cpu.status = (cpu.y === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the value stored is set
    cpu.status = (cpu.y & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function LSR(memoryLocation) {
    /*
    Logical Shift Right
    A,Z,C,N = M/2 or M,Z,C,N = M/2
    Each of the bits in A or M is shift one place to the right. The bit that was in bit 0 is shifted into
    the carry flag. Bit 7 is set to zero.
    http://www.6502.org/users/obelisk/6502/reference.html#LSR
    */
    // LSR admits Absolute,X addressing but it applies no cycle penalty for page crossing, so we just obtain the
    // effective address from the object returned by the getAbsoluteX function and ignore the page crossing flag
    if (typeof memoryLocation === "object") {
        // If memoryLocation is an object it was returned by getAbsoluteX, getAbsoluteY or getIndirectYIndexed
        // Destructure the object to get the address (ignore page crossing flag)
        const { effectiveAddress } = memoryLocation;
        memoryLocation = effectiveAddress; // Use the effective address for the operation
    }

    // When the instruction has no arguments (1 byte instruction) the operation is performed on the accumulator
    if (memoryLocation === "accumulator") {
        // Set carry flag if bit 0 is set
        cpu.status = (cpu.a & 0x01) ? (cpu.status | 0x01) : (cpu.status & ~0x01);
        cpu.a = (cpu.a >> 1) & 0xFF;  // Shift one bit right
        // Set zero flag if result is zero
        cpu.status = (cpu.a === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
        // Set negative flag if bit 7 of the result is set
        cpu.status = (cpu.a & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
    } else {    // Operation is done on the contents of memoryLocation
        const value = mainMemory[memoryLocation];
        // Set carry flag if bit 0 is set
        cpu.status = (value & 0x01) ? (cpu.status | 0x01) : (cpu.status & ~0x01);
        mainMemory[memoryLocation] = (value >> 1) & 0xFF;  // Shift one bit right
        // Set zero flag if result is zero
        cpu.status =
            (mainMemory[memoryLocation] === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
        // Set negative flag if bit 7 of the result is set
        cpu.status =
            (mainMemory[memoryLocation] & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
    }
}

export function NOP() {
    /*
    No Operation
    The NOP instruction causes no changes to the processor other than the normal incrementing of the program counter
    to the next instruction.
    http://www.6502.org/users/obelisk/6502/reference.html#NOP
    */
}

export function ORA(memoryLocation) {
    /*
    Logical Inclusive OR
    A,Z,N = A|M
    An inclusive OR is performed, bit by bit, on the accumulator contents using the contents of a byte of memory.
    http://www.6502.org/users/obelisk/6502/reference.html#ORA
    */
    if (typeof memoryLocation === "object") {
        // If memoryLocation is an object it was returned by getAbsoluteX, getAbsoluteY or getIndirectYIndexed
        // Destructure the object to get the address and page crossing flag
        const { effectiveAddress, pageCrossed } = memoryLocation;
        // If pageCrossed is true, it means the effective address crosses a page boundary
        if (pageCrossed) {
            cpu.currentInstructionCycles += 1; // Add an extra cycle if the page boundary is crossed
        }
        memoryLocation = effectiveAddress; // Use the effective address for the operation
    }

    const value = mainMemory[memoryLocation];
    cpu.a |= value; // Perform OR operation
    // Set zero flag if result is zero
    cpu.status = (cpu.a === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpu.status = (cpu.a & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function PHA() {
    /*
    Push Accumulator
    Pushes a copy of the accumulator on to the stack.
    http://www.6502.org/users/obelisk/6502/reference.html#PHA
    */
    // The stack is located between 0x01FF-0x0100, grows downwards and is an empty stack
    // (the stack pointer points to the element where the next value will be stored)
    mainMemory[0x0100 + cpu.sp] = cpu.a; // Push accumulator
    cpu.sp = (cpu.sp - 1) & 0xFF; // Decrement stack pointer
}

export function PHP() {
    /*
    Push Processor Status
    Pushes a copy of the status flags on to the stack.
    http://www.6502.org/users/obelisk/6502/reference.html#PHP
    */
    // The stack is located between 0x01FF-0x0100, grows downwards and is an empty stack
    // (the stack pointer points to the element where the next value will be stored)
    // Set bit 4 (break flag) and bit 5 (ignored) to 1 (https://www.masswerk.at/6502/6502_instruction_set.html#PHP)
    cpu.status |= 0x30;    // Set break flag and ignored bit (or with 00110000 = 0x30)
    mainMemory[0x0100 + cpu.sp] = cpu.status; // Push status register
    cpu.sp = (cpu.sp - 1) & 0xFF; // Decrement stack pointer
}

export function PLA() {
    /*
    Pull Accumulator
    Pulls an 8 bit value from the stack and into the accumulator. The zero and negative flags are set as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#PLA
    */
    cpu.sp = (cpu.sp + 1) & 0xFF; // Increment stack pointer to point to last pushed value
    cpu.a = mainMemory[0x0100 + cpu.sp]; // Pull accumulator
    // Set zero flag if value pulled is zero
    cpu.status = (cpu.a === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the value pulled is set
    cpu.status = (cpu.a & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function PLP() {
    /*
    Pull Processor Status
    Pulls an 8 bit value from the stack and into the processor flags.
    The flags will take on new states as determined by the value pulled.
    http://www.6502.org/users/obelisk/6502/reference.html#PLP
    */
    cpu.sp = (cpu.sp + 1) & 0xFF; // Increment stack pointer to point to last pushed value
    // Pull status register ignoring the break flag and ignored bit
    // (https://www.masswerk.at/6502/6502_instruction_set.html#PLP)
    cpu.status = (mainMemory[0x0100 + cpu.sp]) & ~0x30;
}

export function ROL(memoryLocation) {
    /*
    Rotate Left
    Move each of the bits in either A or M one place to the left. Bit 0 is filled with the current value of the carry
    flag whilst the old bit 7 becomes the new carry flag value.
    http://www.6502.org/users/obelisk/6502/reference.html#ROL
    */
    // ROL admits Absolute,X addressing but it applies no cycle penalty for page crossing, so we just obtain the
    // effective address from the object returned by the getAbsoluteX function and ignore the page crossing flag
    if (typeof memoryLocation === "object") {
        // If memoryLocation is an object it was returned by getAbsoluteX, getAbsoluteY or getIndirectYIndexed
        // Destructure the object to get the address (ignore page crossing flag)
        const { effectiveAddress } = memoryLocation;
        memoryLocation = effectiveAddress; // Use the effective address for the operation
    }

    const carry = cpu.status & 0x01;  // Store carry flag to set it to bit 0 of the result later
    // When the instruction has no arguments (1 byte instruction) the operation is performed on the accumulator
    if (memoryLocation === "accumulator") {
        // Set carry flag if bit 7 is set
        cpu.status = (cpu.a & 0x80) ? (cpu.status | 0x01) : (cpu.status & ~0x01);
        // Shift one bit left and store only the lower byte (ignore carry)
        cpu.a = (cpu.a << 1) & 0xFF;
        cpu.a |= carry;   // Set bit 0 to previous carry flag
        // Set zero flag if result is zero
        cpu.status = (cpu.a === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
        // Set negative flag if bit 7 of the result is set
        cpu.status = (cpu.a & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
    } else {    // Operation is done on the contents of memoryLocation
        const value = mainMemory[memoryLocation];
        // Set carry flag if bit 7 is set
        cpu.status = (value & 0x80) ? (cpu.status | 0x01) : (cpu.status & ~0x01);
        // Shift one bit left and store only the lower byte (ignore carry)
        mainMemory[memoryLocation] = (value << 1) & 0xFF;
        mainMemory[memoryLocation] |= carry;   // Set bit 0 to previous carry flag
        // Set zero flag if result is zero
        cpu.status =
            (mainMemory[memoryLocation] === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
        // Set negative flag if bit 7 of the result is set
        cpu.status =
            (mainMemory[memoryLocation] & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
    }
}

export function ROR(memoryLocation) {
    /*
    Rotate Right
    Move each of the bits in either A or M one place to the left.
    Bit 0 is filled with the current value of the carry flag whilst the old bit 7 becomes the new carry flag value.
    http://www.6502.org/users/obelisk/6502/reference.html#ROR
    */
    // ROR admits Absolute,X addressing but it applies no cycle penalty for page crossing, so we just obtain the
    // effective address from the object returned by the getAbsoluteX function and ignore the page crossing flag
    if (typeof memoryLocation === "object") {
        // If memoryLocation is an object it was returned by getAbsoluteX, getAbsoluteY or getIndirectYIndexed
        // Destructure the object to get the address (ignore page crossing flag)
        const { effectiveAddress } = memoryLocation;
        memoryLocation = effectiveAddress; // Use the effective address for the operation
    }

    const carry = cpu.status & 0x01;
    // When the instruction has no arguments (1 byte instruction) the operation is performed on the accumulator
    if (memoryLocation === "accumulator") {
        // Set carry flag if bit 0 is set
        cpu.status = (cpu.a & 0x01) ? (cpu.status | 0x01) : (cpu.status & ~0x01);
        cpu.a = (cpu.a >> 1) & 0xFF;  // Shift one bit right
        cpu.a |= (carry << 7);   // Set bit 7 to previous carry flag
        // Set zero flag if result is zero
        cpu.status = (cpu.a === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
        // Set negative flag if bit 7 of the result is set
        cpu.status = (cpu.a & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
    } else {    // Operation is done on the contents of memoryLocation
        const value = mainMemory[memoryLocation];
        // Set carry flag if bit 0 is set
        cpu.status = (value & 0x01) ? (cpu.status | 0x01) : (cpu.status & ~0x01);
        mainMemory[memoryLocation] = (value >> 1) & 0xFF;  // Shift one bit right
        mainMemory[memoryLocation] |= (carry << 7);   // Set bit 7 to previous carry flag
        // Set zero flag if result is zero
        cpu.status =
            (mainMemory[memoryLocation] === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
        // Set negative flag if bit 7 of the result is set
        cpu.status =
            (mainMemory[memoryLocation] & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
    }
}

export function RTI() {
    /*
    Return from Interrupt
    The RTI instruction is used at the end of an interrupt processing routine.
    It pulls the processor flags from the stack followed by the program counter.
    http://www.6502.org/users/obelisk/6502/reference.html#RTI
    */
    cpu.sp = (cpu.sp + 1) & 0xFF; // Increment stack pointer to point to last pushed value
    // Pull status register ignoring the break flag and ignored bit
    // (https://www.masswerk.at/6502/6502_instruction_set.html#RTI)
    cpu.status = (mainMemory[0x0100 + cpu.sp]) & ~0x30;
    cpu.sp = (cpu.sp + 1) & 0xFF; // Increment stack pointer
    const lowPC = mainMemory[0x0100 + cpu.sp]; // Pull low byte of return address
    cpu.sp = (cpu.sp + 1) & 0xFF; // Increment stack pointer
    const highPC = mainMemory[0x0100 + cpu.sp]; // Pull high byte of return address
    cpu.pc = ((highPC << 8) | lowPC) & 0xFFFF; // Set program counter to the return address
}

export function RTS() {
    /*
    Return from Subroutine
    The RTS instruction is used at the end of a subroutine to return to the calling routine.
    It pulls the program counter (minus one) from the stack.
    http://www.6502.org/users/obelisk/6502/reference.html#RTS
    */
    cpu.sp = (cpu.sp + 1) & 0xFF; // Increment stack pointer to point to last pushed value
    const lowPC = mainMemory[0x0100 + cpu.sp]; // Pull low byte of return address
    cpu.sp = (cpu.sp + 1) & 0xFF; // Increment stack pointer
    const highPC = mainMemory[0x0100 + cpu.sp]; // Pull high byte of return address
    cpu.pc = ((highPC << 8) | lowPC) & 0xFFFF; // Set program counter to the return address
    // The PC pulled needs to be incremented by 1 to point to the next instruction after the RTS
    // This is explained in the JSR instruction, which pushes the return address minus one
    // (last byte of the RTS instruction) due to the internal working of the 6502, as seen in
    // 1976 MCS 6500 Family Programming Manual (*1) in section 8.1 JSR - Jump to Subroutine p.106..109
    // https://archive.org/details/6500-50a_mcs6500pgmmanjan76/page/n121/mode/2up?view=theater
    cpu.pc = (cpu.pc + 1) & 0xFFFF;
}

export function SBC(memoryLocation) {
    /*
    Subtract with Carry
    A,Z,C,N = A-M-(1-C)
    This instruction subtracts the contents of a memory location to the accumulator together with the not of
    the carry bit. If overflow occurs the carry bit is clear, this enables multiple byte subtraction to be performed.
    http://www.6502.org/users/obelisk/6502/reference.html#SBC
    Note: The original 6502 does support decimal mode for this instruction, but the NES 6502 does not,
    so it is not implemented here.
    */
    if (typeof memoryLocation === "object") {
        // If memoryLocation is an object it was returned by getAbsoluteX, getAbsoluteY or getIndirectYIndexed
        // Destructure the object to get the address and page crossing flag
        const { effectiveAddress, pageCrossed } = memoryLocation;
        // If pageCrossed is true, it means the effective address crosses a page boundary
        if (pageCrossed) {
            cpu.currentInstructionCycles += 1; // Add an extra cycle if the page boundary is crossed
        }
        memoryLocation = effectiveAddress; // Use the effective address for the operation
    }

    const value = mainMemory[memoryLocation];
    const carry = (cpu.status & 0x01) ? 1 : 0;
    // Substract value of memoryLocation and carry from accumulator
    let result = cpu.a - value - (1 - carry);
    // Clear carry flag if overflow in bit 7 (negative binary result)
    cpu.status = (result < 0x00) ? (cpu.status & ~0x01) : (cpu.status | 0x01);
    result &= 0xFF; // Save only the lower byte (ignore carry) to keep the 2's complement representation of the result
    // When substracting 2's complement numbers an overflow happens if A and M have different sign and the sign of the
    // result different from A. Doing an XOR with the 7th bit of 2 values will result in 0 if they have the same sign
    // and 0x80 if their sign is different
    if ((((cpu.a ^ value) & 0x80) !== 0) && (((cpu.a ^ result) & 0x80) !== 0)) {
        cpu.status |= 0x40;    // Set overflow flag if overflow occurs
    } else {
        cpu.status &= ~0x40;   // Clear overflow flag if no overflow
    }
    cpu.a = result;
    // Set zero flag if result is zero
    cpu.status = (cpu.a === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpu.status = (cpu.a & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function SEC() {
    /*
    Set Carry Flag
    C = 1
    Set the carry flag to one.
    http://www.6502.org/users/obelisk/6502/reference.html#SEC
    */
    cpu.status = cpu.status | 0x01; // Set bit 0 (carry flag)
}

export function SED() {
    /*
    Set Decimal Flag
    D = 1
    Set the decimal mode flag to one.
    http://www.6502.org/users/obelisk/6502/reference.html#SED
    */
    cpu.status = cpu.status | 0x08; // Set bit 3 (decimal mode flag)
}

export function SEI() {
    /*
    Set Interrupt Disable
    I = 1
    Set the interrupt disable flag to one.
    http://www.6502.org/users/obelisk/6502/reference.html#SEI
    */
    cpu.status = cpu.status | 0x04; // Set bit 2 (interrupt disable flag)
}

export function STA(memoryLocation) {
    /*
    Store Accumulator
    M = A
    Stores the contents of the accumulator into memory.
    http://www.6502.org/users/obelisk/6502/reference.html#STA
    */
    // STA admits Absolute,X, Absolute,Y and (Indirect),Y addressing but it applies no cycle penalty for page crossing,
    // so we just obtain the effective address from the object returned by the getAbsoluteX function and ignore the page
    // crossing flag
    if (typeof memoryLocation === "object") {
        // If memoryLocation is an object it was returned by getAbsoluteX, getAbsoluteY or getIndirectYIndexed
        // Destructure the object to get the address (ignore page crossing flag)
        const { effectiveAddress } = memoryLocation;
        memoryLocation = effectiveAddress; // Use the effective address for the operation
    }

    mainMemory[memoryLocation] = cpu.a;
}

export function STX(memoryLocation) {
    /*
    Store X Register
    M = X
    Stores the contents of the X register into memory.
    http://www.6502.org/users/obelisk/6502/reference.html#STX
    */
    mainMemory[memoryLocation] = cpu.x;
}

export function STY(memoryLocation) {
    /*
    Store Y Register
    M = Y
    Stores the contents of the Y register into memory.
    http://www.6502.org/users/obelisk/6502/reference.html#STY
    */
    mainMemory[memoryLocation] = cpu.y;
}

export function TAX() {
    /*
    Transfer Accumulator to X
    X = A
    Copies the current contents of the accumulator into the X register and sets the zero and
    negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#TAX
    */
    cpu.x = cpu.a;
    // Set zero flag if value transfered is zero
    cpu.status = (cpu.x === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the value transfered is set
    cpu.status = (cpu.x & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function TAY() {
    /*
    Transfer Accumulator to Y
    Y = A
    Copies the current contents of the accumulator into the Y register and sets the zero and
    negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#TAY
    */
    cpu.y = cpu.a;
    // Set zero flag if value transfered is zero
    cpu.status = (cpu.y === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the value transfered is set
    cpu.status = (cpu.y & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function TSX() {
    /*
    Transfer Stack Pointer to X
    X = S
    Copies the current contents of the stack register into the X register and sets the zero and
    negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#TSX
    */
    cpu.x = cpu.sp;
    // Set zero flag if value transfered is zero
    cpu.status = (cpu.x === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the value transfered is set
    cpu.status = (cpu.x & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function TXA() {
    /*
    Transfer X to Accumulator
    A = X
    Copies the current contents of the X register into the accumulator and sets the zero and
    negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#TXA
    */
    cpu.a = cpu.x;
    // Set zero flag if value transfered is zero
    cpu.status = (cpu.a === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the value transfered is set
    cpu.status = (cpu.a & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

export function TXS() {
    /*
    Transfer X to Stack Pointer
    S = X
    Copies the current contents of the X register into the stack register.
    http://www.6502.org/users/obelisk/6502/reference.html#TXS
    */
    cpu.sp = cpu.x; // Store X register in stack pointer
}

export function TYA() {
    /*
    Transfer Y to Accumulator
    A = Y
    Copies the current contents of the Y register into the accumulator and sets the zero and
    negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#TYA
    */
    cpu.a = cpu.y;
    // Set zero flag if value transfered is zero
    cpu.status = (cpu.a === 0x00) ? (cpu.status | 0x02) : (cpu.status & ~0x02);
    // Set negative flag if bit 7 of the value transfered is set
    cpu.status = (cpu.a & 0x80) ? (cpu.status | 0x80) : (cpu.status & ~0x80);
}

