import { cpuRegisters } from './main.js';
import { mainMemory } from './main.js';

// Lookup table for addressing mode handlers an their names in the opcode matrix
export const address_mode_handlers = {
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
    return (((operand2 << 8) | operand1) + cpuRegisters.x) & 0xFFFF;   // Ensure it wraps around at 0xFFFF
}

export function getAbsoluteY(operand1, operand2) {
    /*
    OPC $LLHH,Y
    operand is address; effective address is address incremented by Y with carry
    Return the 16-bit address formed by combining the two bytes after shifting the second left by 8 bits and adding Y
    */
    return (((operand2 << 8) | operand1) + cpuRegisters.y) & 0xFFFF;   // Ensure it wraps around at 0xFFFF
}

export function getImmediate() {
    /*
    OPC #$BB
    operand is byte BB*
    Return the address of the immediate value (PC-1 since we increment PC+2 before execution)
    *Note:  This is done to keep consistency in the get functions to always return addresses so that no distinction
            needs to be made between addressing modes in the instruction handlers
    */
    return (cpuRegisters.pc - 1) & 0xFFFF;
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
    const address = (operand + cpuRegisters.x) & 0xFF; // Address of the LSB of the word
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
    return ((mainMemory[address] | (mainMemory[(address + 1) & 0xFF] << 8)) + cpuRegisters.y) & 0xFFFF;
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
    return (operand + cpuRegisters.x) & 0xFF;
}

export function getZeropageYIndexed(operand) {
    /*
    OPC $LL,Y
    operand is zeropage address; effective address is address incremented by Y without carry
    return the zeropage address calculated by adding the byte operand to the value of register Y
    (The address calculation wraps around if the sum of the base address and the register exceed $FF)
    */
    return (operand + cpuRegisters.y) & 0xFF;
}

// Functions to handle the execution of instructions

export function ADC(memory_location) {
    /*
    Add with Carry
    A,Z,C,N = A+M+C
    This instruction adds the contents of a memory location to the accumulator together with the carry bit.
    If overflow occurs the carry bit is set, this enables multiple byte addition to be performed.
    http://www.6502.org/users/obelisk/6502/reference.html#ADC
    Note: The original 6502 does support decimal mode for this instruction, but the NES 6502 does not,
    so it is not implemented here.
    */
    const value = mainMemory[memory_location];
    const carry = (cpuRegisters.status & 0x01) ? 1 : 0;
    let result = cpuRegisters.a + value + carry; // Add accumulator, value of memory_location and carry
    // Set carry flag if overflow in bit 7
    cpuRegisters.status = (result > 0xFF) ? (cpuRegisters.status | 0x01) : (cpuRegisters.status & ~0x01);
    result &= 0xFF; // Save only the lower byte (ignore carry) to keep the 2's complement representation of the result

    // When adding 2's complement numbers an overflow happens if A and M have the same sign but the sign of the result
    // is different. Doing an XOR with the 7th bit of 2 values will result in 0 if they have the same sign and 0x80 if
    // their sign is different
    if ((((cpuRegisters.a ^ value) & 0x80) === 0) && (((cpuRegisters.a ^ result) & 0x80) !== 0)) {
        cpuRegisters.status |= 0x40;    // Set overflow flag if overflow occurs
    } else {
        cpuRegisters.status &= ~0x40;   // Clear overflow flag if no overflow
    }
    cpuRegisters.a = result;
    // Set zero flag if result is zero
    cpuRegisters.status = (cpuRegisters.a === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function AND(memory_location) {
    /*
    Logical AND
    A,Z,N = A&M
    A logical AND is performed, bit by bit, on the accumulator contents using the contents of a byte of memory.
    http://www.6502.org/users/obelisk/6502/reference.html#AND
    */
    const value = mainMemory[memory_location];
    cpuRegisters.a &= value; // Perform AND operation
    // Set zero flag if result is zero
    cpuRegisters.status = (cpuRegisters.a === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function ASL(memory_location) {
    /*
    Arithmetic Shift Left
    A,Z,C,N = M*2 or M,Z,C,N = M*2
    This operation shifts all the bits of the accumulator or memory contents one bit left.
    Bit 0 is set to 0 and bit 7 is placed in the carry flag.
    The effect of this operation is to multiply the memory contents by 2 (ignoring 2's complement considerations),
    setting the carry if the result will not fit in 8 bits.
    http://www.6502.org/users/obelisk/6502/reference.html#ASL
    */
    // When the instruction has no arguments (1 byte instruction) the operation is performed on the accumulator
    if (memory_location === "accumulator") {
        // Set carry flag if bit 7 is set
        cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x01) : (cpuRegisters.status & ~0x01);
        // Shift one bit left and store only the lower byte (ignore carry)
        cpuRegisters.a = (cpuRegisters.a << 1) & 0xFF;
        // Set zero flag if result is zero
        cpuRegisters.status = (cpuRegisters.a === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
        // Set negative flag if bit 7 of the result is set
        cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
    } else {    // Operation is done on the contents of memory_location
        const value = mainMemory[memory_location];
        // Set carry flag if bit 7 is set
        cpuRegisters.status = (value & 0x80) ? (cpuRegisters.status | 0x01) : (cpuRegisters.status & ~0x01);
        // Shift one bit left and store only the lower byte (ignore carry)
        mainMemory[memory_location] = (value << 1) & 0xFF;
        // Set zero flag if result is zero
        cpuRegisters.status =
            (mainMemory[memory_location] === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
        // Set negative flag if bit 7 of the result is set
        cpuRegisters.status =
            (mainMemory[memory_location] & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
    }
}

export function BCC(displacement) {
    /*
    Branch if Carry Clear
    If the carry flag is clear then add the relative displacement to the program counter to cause a branch to
    a new location.
    http://www.6502.org/users/obelisk/6502/reference.html#BCC
    */
    if (!(cpuRegisters.status & 0x01)) { // Check if carry flag is clear
        const new_pc = cpuRegisters.pc + displacement; // Calculate program counter after branch
        cpuRegisters.pc = new_pc & 0xFFFF; // Update program counter, ensuring it wraps around at 0xFFFF
    }
}

export function BCS(displacement) {
    /*
    Branch if Carry Set
    If the carry flag is set then add the relative displacement to the program counter to cause a branch to
    a new location.
    http://www.6502.org/users/obelisk/6502/reference.html#BCS
    */
    if (cpuRegisters.status & 0x01) { // Check if carry flag is set
        const new_pc = cpuRegisters.pc + displacement; // Calculate program counter after branch
        cpuRegisters.pc = new_pc & 0xFFFF; // Update program counter, ensuring it wraps around at 0xFFFF
    }
}

export function BEQ(displacement) {
    /*
    Branch if Equal
    If the zero flag is set then add the relative displacement to the program counter to cause a branch to
    a new location.
    http://www.6502.org/users/obelisk/6502/reference.html#BEQ
    */
    if (cpuRegisters.status & 0x02) { // Check if zero flag is set
        const new_pc = cpuRegisters.pc + displacement; // Calculate program counter after branch
        cpuRegisters.pc = new_pc & 0xFFFF; // Update program counter, ensuring it wraps around at 0xFFFF
    }
}

export function BIT(memory_location) {
    /*
    Bit Test
    Z = A & M, N = M7, V = M6
    This instructions is used to test if one or more bits are set in a target memory location.
    The mask pattern in A is ANDed with the value in memory to set or clear the zero flag,
    but the result is not kept. Bits 7 and 6 of the value from memory are copied into the N and V flags.
    http://www.6502.org/users/obelisk/6502/reference.html#BIT
    */
    const value = mainMemory[memory_location];
    const result = cpuRegisters.a & value;

    // Set zero flag if result is zero
    cpuRegisters.status = (result === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Copy bit 7 of value to negative flag
    cpuRegisters.status = (value & 0x08) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
    // Copy bit 6 of value to overflow flag
    cpuRegisters.status = (value & 0x40) ? (cpuRegisters.status | 0x40) : (cpuRegisters.status & ~0x40);
}

export function BMI(displacement) {
    /*
    Branch if Minus
    If the negative flag is set then add the relative displacement to the program counter to cause a branch to
    a new location.
    http://www.6502.org/users/obelisk/6502/reference.html#BMI
    */
    if (cpuRegisters.status & 0x80) { // Check if negative flag is set
        const new_pc = cpuRegisters.pc + displacement; // Calculate program counter after branch
        cpuRegisters.pc = new_pc & 0xFFFF; // Update program counter, ensuring it wraps around at 0xFFFF
    }
}

export function BNE(displacement) {
    /*
    Branch if Not Equal
    If the zero flag is clear then add the relative displacement to the program counter to cause a branch to
    a new location.
    http://www.6502.org/users/obelisk/6502/reference.html#BNE
    */
    if (!(cpuRegisters.status & 0x02)) { // Check if zero flag is clear
        const new_pc = cpuRegisters.pc + displacement; // Calculate program counter after branch
        cpuRegisters.pc = new_pc & 0xFFFF; // Update program counter, ensuring it wraps around at 0xFFFF
    }
}

export function BPL(displacement) {
    /*
    Branch if Minus
    If the negative flag is clear then add the relative displacement to the program counter to cause a branch to
    a new location.
    http://www.6502.org/users/obelisk/6502/reference.html#BPL
    */
    if (!(cpuRegisters.status & 0x80)) { // Check if negative flag is clear
        const new_pc = cpuRegisters.pc + displacement; // Calculate program counter after branch
        cpuRegisters.pc = new_pc & 0xFFFF; // Update program counter, ensuring it wraps around at 0xFFFF
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
    const returnAddress = (cpuRegisters.pc + 1) & 0xFFFF;
    // Note: I found no reference to the order in which PC + 1 is pushed (HHLL or LLHH), but
    //       https://mirrors.apple2.org.za/ftp.apple.asimov.net/documentation/hardware/processors/MCS6500%20Family%20Programming%20Manual.pdf
    //       states that in the RTI instruction the return address is popped in the order LL HH, so I will assume that
    //       BRK pushes it in order HH LL
    mainMemory[0x0100 + cpuRegisters.sp] = (returnAddress >> 8) & 0xFF; // Push high byte of return address
    cpuRegisters.sp = (cpuRegisters.sp - 1) & 0xFF; // Decrement stack pointer
    mainMemory[0x0100 + cpuRegisters.sp] = returnAddress & 0xFF; // Push low byte of return address
    cpuRegisters.sp = (cpuRegisters.sp - 1) & 0xFF; // Decrement stack pointer
    cpuRegisters.status |= 0x10; // Set break flag (bit 4) in status register
    mainMemory[0x0100 + cpuRegisters.sp] = cpuRegisters.status; // Push status register
    cpuRegisters.sp = (cpuRegisters.sp - 1) & 0xFF; // Decrement stack pointer

    const interrupt_address_low = mainMemory[0xFFFE]; // Read low byte of IRQ interrupt vector
    const interrupt_address_high = mainMemory[0xFFFF]; // Read high byte of IRQ interrupt vector
    // Combine the two bytes to form the address
    const interrupt_handler_address = (interrupt_address_high << 8) | interrupt_address_low;
    cpuRegisters.pc = interrupt_handler_address & 0xFFFF; // Set PC to the target memory address
}

export function BVC(displacement) {
    /*
    Branch if Overflow Clear
    If the overflow flag is clear then add the relative displacement to the program counter to cause a branch to
    a new location.
    http://www.6502.org/users/obelisk/6502/reference.html#BVC
    */
    if (!(cpuRegisters.status & 0x04)) { // Check if overflow flag is clear
        const new_pc = cpuRegisters.pc + displacement; // Calculate program counter after branch
        cpuRegisters.pc = new_pc & 0xFFFF; // Update program counter, ensuring it wraps around at 0xFFFF
    }
}

export function BVS(displacement) {
    /*
    Branch if Overflow Set
    If the overflow flag is set then add the relative displacement to the program counter to cause a branch to
    a new location.
    http://www.6502.org/users/obelisk/6502/reference.html#BVS
    */
    if (cpuRegisters.status & 0x04) { // Check if overflow flag is set
        const new_pc = cpuRegisters.pc + displacement; // Calculate program counter after branch
        cpuRegisters.pc = new_pc & 0xFFFF; // Update program counter, ensuring it wraps around at 0xFFFF
    }
}

export function CLC() {
    /*
    Clear Carry Flag
    C = 0
    Set the carry flag to zero.
    http://www.6502.org/users/obelisk/6502/reference.html#CLC
    */
    cpuRegisters.status = cpuRegisters.status & ~0x01; // Clear bit 0 (carry flag)
}

export function CLD() {
    /*
    Clear Decimal Mode
    D = 0
    Set the decimal mode flag to zero.
    http://www.6502.org/users/obelisk/6502/reference.html#CLD
    */
    cpuRegisters.status = cpuRegisters.status & ~0x08; // Clear bit 3 (decimal mode flag)
}

export function CLI() {
    /*
    Clear Interrupt Disable
    I = 0
    Clears the interrupt disable flag allowing normal interrupt requests to be serviced.
    http://www.6502.org/users/obelisk/6502/reference.html#CLI
    */
    cpuRegisters.status = cpuRegisters.status & ~0x04; // Clear bit 2 (interrupt disable flag)
}

export function CLV() {
    /*
    Clear Overflow Flag
    V = 0
    Clears the overflow flag.
    http://www.6502.org/users/obelisk/6502/reference.html#CLV
    */
    cpuRegisters.status = cpuRegisters.status & ~0x40; // Clear bit 6 (overflow flag)
}

export function CMP(memory_location) {
    /*
    Compare
    Z,C,N = A-M
    This instruction compares the contents of the accumulator with another memory held value and sets the zero and
    carry flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#CMP
    */
    const value = mainMemory[memory_location];
    const result = (cpuRegisters.a - value) & 0xFF; // Subtract memory value from accumulator
    // Set carry flag if result is non-negative (A >= M)
    cpuRegisters.status = (result >= 0) ? (cpuRegisters.status | 0x01) : (cpuRegisters.status & ~0x01);
    // Set zero flag if result is zero (A === M)
    cpuRegisters.status = (result === 0) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpuRegisters.status = (result & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function CPX(memory_location) {
    /*
    Compare X Register
    Z,C,N = X-M
    This instruction compares the contents of the X register with another memory held value and sets the zero and
    carry flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#CPX
    */
    const value = mainMemory[memory_location];
    const result = (cpuRegisters.x - value) & 0xFF; // Subtract memory value from X register
    // Set carry flag if result is non-negative (A >= M)
    cpuRegisters.status = (result >= 0) ? (cpuRegisters.status | 0x01) : (cpuRegisters.status & ~0x01);
    // Set zero flag if result is zero (A === M)
    cpuRegisters.status = (result === 0) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpuRegisters.status = (result & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function CPY(memory_location) {
    /*
    Compare Y Register
    Z,C,N = Y-M
    This instruction compares the contents of the Y register with another memory held value and sets the zero and
    carry flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#CPY
    */
    const value = mainMemory[memory_location];
    const result = (cpuRegisters.y - value) & 0xFF; // Subtract memory value from Y register
    // Set carry flag if result is non-negative (A >= M)
    cpuRegisters.status = (result >= 0) ? (cpuRegisters.status | 0x01) : (cpuRegisters.status & ~0x01);
    // Set zero flag if result is zero (A === M)
    cpuRegisters.status = (result === 0) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpuRegisters.status = (result & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function DEC(memory_location) {
    /*
    Decrement Memory
    M,Z,N = M-1
    Subtracts one from the value held at a specified memory location setting the zero and negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#DEC
    */
    const value = mainMemory[memory_location];
    const result = (value - 1) & 0xFF; // Subtract 1 from memory value (wraps around from 0x00 to 0xFF)
    mainMemory[memory_location] = result; // Store result in original memory location
    // Set zero flag if result is zero
    cpuRegisters.status = (result === 0) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpuRegisters.status = (result & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function DEX() {
    /*
    Decrement X Register
    X,Z,N = X-1
    Subtracts one from the X register setting the zero and negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#DEX
    */
    const result = (cpuRegisters.x - 1) & 0xFF; // Subtract 1 from X register (wraps around from 0x00 to 0xFF)
    cpuRegisters.x = result; // Store result in X register
    // Set zero flag if result is zero
    cpuRegisters.status = (result === 0) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpuRegisters.status = (result & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function DEY() {
    /*
    Decrement Y Register
    Y,Z,N = Y-1
    Subtracts one from the Y register setting the zero and negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#DEY
    */
    const result = (cpuRegisters.y - 1) & 0xFF; // Subtract 1 from Y register (wraps around from 0x00 to 0xFF)
    cpuRegisters.y = result; // Store result in Y register
    // Set zero flag if result is zero
    cpuRegisters.status = (result === 0) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpuRegisters.status = (result & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function EOR(memory_location) {
    /*
    Exclusive OR
    A,Z,N = A^M
    An exclusive OR is performed, bit by bit, on the accumulator contents using the contents of a byte of memory.
    http://www.6502.org/users/obelisk/6502/reference.html#EOR
    */
    const value = mainMemory[memory_location];
    cpuRegisters.a ^= value; // Perform XOR operation
    // Set zero flag if result is zero
    cpuRegisters.status = (cpuRegisters.a === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function INC(memory_location) {
    /*
    Increment Memory
    M,Z,N = M+1
    Adds one to the value held at a specified memory location setting the zero and negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#INC
    */
    const value = mainMemory[memory_location];
    const result = (value + 1) & 0xFF; // Subtract 1 from memory value (wraps around from 0xFF to 0x00)
    mainMemory[memory_location] = result; // Store result in original memory location
    // Set zero flag if result is zero
    cpuRegisters.status = (result === 0) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpuRegisters.status = (result & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function INX() {
    /*
    Increment X Register
    X,Z,N = X+1
    Adds one to the X register setting the zero and negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#INX
    */
    const result = (cpuRegisters.x - 1) & 0xFF; // Subtract 1 from X register (wraps around from 0x00 to 0xFF)
    cpuRegisters.x = result; // Store result in X register
    // Set zero flag if result is zero
    cpuRegisters.status = (result === 0) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpuRegisters.status = (result & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function INY() {
    /*
    Increment Y Register
    Y,Z,N = Y+1
    Adds one to the Y register setting the zero and negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#INY
    */
    const result = (cpuRegisters.y - 1) & 0xFF; // Subtract 1 from Y register (wraps around from 0x00 to 0xFF)
    cpuRegisters.y = result; // Store result in Y register
    // Set zero flag if result is zero
    cpuRegisters.status = (result === 0) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpuRegisters.status = (result & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function JMP(memory_location) {
    /*
    Jump
    PC = $HHLL
    Sets the program counter to the address specified by the operand.
    http://www.6502.org/users/obelisk/6502/reference.html#JMP
    */
    cpuRegisters.pc = memory_location & 0xFFFF; // Ensure it wraparound at 0xFFFF
}

export function JSR(memory_location) {
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
    const returnAddress = (cpuRegisters.pc - 1) & 0xFFFF;

    // The stack is located between 0x01FF-0x0100, grows downwards and is an empty stack
    // (the stack pointer points to the element where the next value will be stored)
    // The stack pointer is an 8-bit resgister that contains the LSB of the stack address (0x0100 + SP)
    // https://www.nesdev.org/wiki/Stack
    mainMemory[0x0100 + cpuRegisters.sp] = (returnAddress >> 8) & 0xFF; // Push high byte of return address
    cpuRegisters.sp = (cpuRegisters.sp - 1) & 0xFF; // Decrement stack pointer
    mainMemory[0x0100 + cpuRegisters.sp] = returnAddress & 0xFF; // Push low byte of return address
    cpuRegisters.sp = (cpuRegisters.sp - 1) & 0xFF; // Decrement stack pointer
    cpuRegisters.pc = memory_location & 0xFFFF; // Set PC to the target memory address
}

export function LDA(memory_location) {
    /*
    Load Accumulator
    A,Z,N = M
    Loads a byte of memory into the accumulator setting the zero and negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#LDA
    */
    const value = mainMemory[memory_location];
    cpuRegisters.a = value; // Store in accumulator
    // Set zero flag if value stored is zero
    cpuRegisters.status = (cpuRegisters.a === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the value stored is set
    cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function LDX(memory_location) {
    /*
    Load X Register
    X,Z,N = M
    Loads a byte of memory into the X register setting the zero and negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#LDX
    */
    const value = mainMemory[memory_location];
    cpuRegisters.x = value; // Store in X register
    // Set zero flag if value stored is zero
    cpuRegisters.status = (cpuRegisters.x === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the value stored is set
    cpuRegisters.status = (cpuRegisters.x & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function LDY(memory_location) {
    /*
    Load Y Register
    Y,Z,N = M
    Loads a byte of memory into the Y register setting the zero and negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#LDY
    */
    const value = mainMemory[memory_location];
    cpuRegisters.y = value; // Store in Y register
    // Set zero flag if value stored is zero
    cpuRegisters.status = (cpuRegisters.y === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the value stored is set
    cpuRegisters.status = (cpuRegisters.y & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function LSR(memory_location) {
    /*
    Logical Shift Right
    A,Z,C,N = M/2 or M,Z,C,N = M/2
    Each of the bits in A or M is shift one place to the right. The bit that was in bit 0 is shifted into
    the carry flag. Bit 7 is set to zero.
    http://www.6502.org/users/obelisk/6502/reference.html#LSR
    */
    // When the instruction has no arguments (1 byte instruction) the operation is performed on the accumulator
    if (memory_location === "accumulator") {
        // Set carry flag if bit 0 is set
        cpuRegisters.status = (cpuRegisters.a & 0x01) ? (cpuRegisters.status | 0x01) : (cpuRegisters.status & ~0x01);
        cpuRegisters.a = (cpuRegisters.a >> 1) & 0xFF;  // Shift one bit right
        // Set zero flag if result is zero
        cpuRegisters.status = (cpuRegisters.a === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
        // Set negative flag if bit 7 of the result is set
        cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
    } else {    // Operation is done on the contents of memory_location
        const value = mainMemory[memory_location];
        // Set carry flag if bit 0 is set
        cpuRegisters.status = (value & 0x01) ? (cpuRegisters.status | 0x01) : (cpuRegisters.status & ~0x01);
        mainMemory[memory_location] = (value >> 1) & 0xFF;  // Shift one bit right
        // Set zero flag if result is zero
        cpuRegisters.status =
            (mainMemory[memory_location] === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
        // Set negative flag if bit 7 of the result is set
        cpuRegisters.status =
            (mainMemory[memory_location] & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
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

export function ORA(memory_location) {
    /*
    Logical Inclusive OR
    A,Z,N = A|M
    An inclusive OR is performed, bit by bit, on the accumulator contents using the contents of a byte of memory.
    http://www.6502.org/users/obelisk/6502/reference.html#ORA
    */
    const value = mainMemory[memory_location];
    cpuRegisters.a |= value; // Perform OR operation
    // Set zero flag if result is zero
    cpuRegisters.status = (cpuRegisters.a === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function PHA() {
    /*
    Push Accumulator
    Pushes a copy of the accumulator on to the stack.
    http://www.6502.org/users/obelisk/6502/reference.html#PHA
    */
    // The stack is located between 0x01FF-0x0100, grows downwards and is an empty stack
    // (the stack pointer points to the element where the next value will be stored)
    mainMemory[0x0100 + cpuRegisters.sp] = cpuRegisters.a; // Push accumulator
    cpuRegisters.sp = (cpuRegisters.sp - 1) & 0xFF; // Decrement stack pointer
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
    cpuRegisters.status |= 0x30;    // Set break flag and ignored bit (or with 00110000 = 0x30)
    mainMemory[0x0100 + cpuRegisters.sp] = cpuRegisters.status; // Push status register
    cpuRegisters.sp = (cpuRegisters.sp - 1) & 0xFF; // Decrement stack pointer
}

export function PLA() {
    /*
    Pull Accumulator
    Pulls an 8 bit value from the stack and into the accumulator. The zero and negative flags are set as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#PLA
    */
    cpuRegisters.sp = (cpuRegisters.sp + 1) & 0xFF; // Increment stack pointer to point to last pushed value
    cpuRegisters.a = mainMemory[0x0100 + cpuRegisters.sp]; // Pull accumulator
    // Set zero flag if value pulled is zero
    cpuRegisters.status = (cpuRegisters.a === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the value pulled is set
    cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function PLP() {
    /*
    Pull Processor Status
    Pulls an 8 bit value from the stack and into the processor flags.
    The flags will take on new states as determined by the value pulled.
    http://www.6502.org/users/obelisk/6502/reference.html#PLP
    */
    cpuRegisters.sp = (cpuRegisters.sp + 1) & 0xFF; // Increment stack pointer to point to last pushed value
    // Pull status register ignoring the break flag and ignored bit
    // (https://www.masswerk.at/6502/6502_instruction_set.html#PLP)
    cpuRegisters.status = (mainMemory[0x0100 + cpuRegisters.sp]) & ~0x30;
}

export function ROL(memory_location) {
    /*
    Rotate Left
    Move each of the bits in either A or M one place to the left. Bit 0 is filled with the current value of the carry
    flag whilst the old bit 7 becomes the new carry flag value.
    http://www.6502.org/users/obelisk/6502/reference.html#ROL
    */
    const carry = cpuRegisters.status & 0x01;  // Store carry flag to set it to bit 0 of the result later
    // When the instruction has no arguments (1 byte instruction) the operation is performed on the accumulator
    if (memory_location === "accumulator") {
        // Set carry flag if bit 7 is set
        cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x01) : (cpuRegisters.status & ~0x01);
        // Shift one bit left and store only the lower byte (ignore carry)
        cpuRegisters.a = (cpuRegisters.a << 1) & 0xFF;
        cpuRegisters.a |= carry;   // Set bit 0 to previous carry flag
        // Set zero flag if result is zero
        cpuRegisters.status = (cpuRegisters.a === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
        // Set negative flag if bit 7 of the result is set
        cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
    } else {    // Operation is done on the contents of memory_location
        const value = mainMemory[memory_location];
        // Set carry flag if bit 7 is set
        cpuRegisters.status = (value & 0x80) ? (cpuRegisters.status | 0x01) : (cpuRegisters.status & ~0x01);
        // Shift one bit left and store only the lower byte (ignore carry)
        mainMemory[memory_location] = (value << 1) & 0xFF;
        mainMemory[memory_location] |= carry;   // Set bit 0 to previous carry flag
        // Set zero flag if result is zero
        cpuRegisters.status =
            (mainMemory[memory_location] === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
        // Set negative flag if bit 7 of the result is set
        cpuRegisters.status =
            (mainMemory[memory_location] & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
    }
}

export function ROR(memory_location) {
    /*
    Rotate Right
    Move each of the bits in either A or M one place to the left.
    Bit 0 is filled with the current value of the carry flag whilst the old bit 7 becomes the new carry flag value.
    http://www.6502.org/users/obelisk/6502/reference.html#ROR
    */
    const carry = cpuRegisters.status & 0x01;
    // When the instruction has no arguments (1 byte instruction) the operation is performed on the accumulator
    if (memory_location === "accumulator") {
        // Set carry flag if bit 0 is set
        cpuRegisters.status = (cpuRegisters.a & 0x01) ? (cpuRegisters.status | 0x01) : (cpuRegisters.status & ~0x01);
        cpuRegisters.a = (cpuRegisters.a >> 1) & 0xFF;  // Shift one bit right
        cpuRegisters.a |= (carry << 7);   // Set bit 7 to previous carry flag
        // Set zero flag if result is zero
        cpuRegisters.status = (cpuRegisters.a === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
        // Set negative flag if bit 7 of the result is set
        cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
    } else {    // Operation is done on the contents of memory_location
        const value = mainMemory[memory_location];
        // Set carry flag if bit 0 is set
        cpuRegisters.status = (value & 0x01) ? (cpuRegisters.status | 0x01) : (cpuRegisters.status & ~0x01);
        mainMemory[memory_location] = (value >> 1) & 0xFF;  // Shift one bit right
        mainMemory[memory_location] |= (carry << 7);   // Set bit 7 to previous carry flag
        // Set zero flag if result is zero
        cpuRegisters.status =
            (mainMemory[memory_location] === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
        // Set negative flag if bit 7 of the result is set
        cpuRegisters.status =
            (mainMemory[memory_location] & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
    }
}

export function RTI() {
    /*
    Return from Interrupt
    The RTI instruction is used at the end of an interrupt processing routine.
    It pulls the processor flags from the stack followed by the program counter.
    http://www.6502.org/users/obelisk/6502/reference.html#RTI
    */
    cpuRegisters.sp = (cpuRegisters.sp + 1) & 0xFF; // Increment stack pointer to point to last pushed value
    // Pull status register ignoring the break flag and ignored bit
    // (https://www.masswerk.at/6502/6502_instruction_set.html#RTI)
    cpuRegisters.status = (mainMemory[0x0100 + cpuRegisters.sp]) & ~0x30;
    cpuRegisters.sp = (cpuRegisters.sp + 1) & 0xFF; // Increment stack pointer
    const PC_low = mainMemory[0x0100 + cpuRegisters.sp]; // Pull low byte of return address
    cpuRegisters.sp = (cpuRegisters.sp + 1) & 0xFF; // Increment stack pointer
    const PC_high = mainMemory[0x0100 + cpuRegisters.sp]; // Pull high byte of return address
    cpuRegisters.pc = ((PC_high << 8) | PC_low) & 0xFFFF; // Set program counter to the return address
}

export function RTS() {
    /*
    Return from Subroutine
    The RTS instruction is used at the end of a subroutine to return to the calling routine.
    It pulls the program counter (minus one) from the stack.
    http://www.6502.org/users/obelisk/6502/reference.html#RTS
    */
    cpuRegisters.sp = (cpuRegisters.sp + 1) & 0xFF; // Increment stack pointer to point to last pushed value
    const PC_low = mainMemory[0x0100 + cpuRegisters.sp]; // Pull low byte of return address
    cpuRegisters.sp = (cpuRegisters.sp + 1) & 0xFF; // Increment stack pointer
    const PC_high = mainMemory[0x0100 + cpuRegisters.sp]; // Pull high byte of return address
    cpuRegisters.pc = ((PC_high << 8) | PC_low) & 0xFFFF; // Set program counter to the return address
    // The PC pulled needs to be incremented by 1 to point to the next instruction after the RTS
    // This is explained in the JSR instruction, which pushes the return address minus one
    // (last byte of the RTS instruction) due to the internal working of the 6502, as seen in
    // 1976 MCS 6500 Family Programming Manual (*1) in section 8.1 JSR - Jump to Subroutine p.106..109
    // https://archive.org/details/6500-50a_mcs6500pgmmanjan76/page/n121/mode/2up?view=theater
    cpuRegisters.pc = (cpuRegisters.pc + 1) & 0xFFFF;
}

export function SBC(memory_location) {
    /*
    Subtract with Carry
    A,Z,C,N = A-M-(1-C)
    This instruction subtracts the contents of a memory location to the accumulator together with the not of
    the carry bit. If overflow occurs the carry bit is clear, this enables multiple byte subtraction to be performed.
    http://www.6502.org/users/obelisk/6502/reference.html#SBC
    Note: The original 6502 does support decimal mode for this instruction, but the NES 6502 does not,
    so it is not implemented here.
    */
    const value = mainMemory[memory_location];
    const carry = (cpuRegisters.status & 0x01) ? 1 : 0;
    // Substract value of memory_location and carry from accumulator
    let result = cpuRegisters.a - value - (1 - carry);
    // Clear carry flag if overflow in bit 7 (negative binary result)
    cpuRegisters.status = (result < 0x00) ? (cpuRegisters.status & ~0x01) : (cpuRegisters.status | 0x01);
    result &= 0xFF; // Save only the lower byte (ignore carry) to keep the 2's complement representation of the result
    // When substracting 2's complement numbers an overflow happens if A and M have different sign and the sign of the
    // result different from A. Doing an XOR with the 7th bit of 2 values will result in 0 if they have the same sign
    // and 0x80 if their sign is different
    if ((((cpuRegisters.a ^ value) & 0x80) !== 0) && (((cpuRegisters.a ^ result) & 0x80) !== 0)) {
        cpuRegisters.status |= 0x40;    // Set overflow flag if overflow occurs
    } else {
        cpuRegisters.status &= ~0x40;   // Clear overflow flag if no overflow
    }
    cpuRegisters.a = result;
    // Set zero flag if result is zero
    cpuRegisters.status = (cpuRegisters.a === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the result is set
    cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function SEC() {
    /*
    Set Carry Flag
    C = 1
    Set the carry flag to one.
    http://www.6502.org/users/obelisk/6502/reference.html#SEC
    */
    cpuRegisters.status = cpuRegisters.status | 0x01; // Set bit 0 (carry flag)
}

export function SED() {
    /*
    Set Decimal Flag
    D = 1
    Set the decimal mode flag to one.
    http://www.6502.org/users/obelisk/6502/reference.html#SED
    */
    cpuRegisters.status = cpuRegisters.status | 0x08; // Set bit 3 (decimal mode flag)
}

export function SEI() {
    /*
    Set Interrupt Disable
    I = 1
    Set the interrupt disable flag to one.
    http://www.6502.org/users/obelisk/6502/reference.html#SEI
    */
    cpuRegisters.status = cpuRegisters.status | 0x04; // Set bit 2 (interrupt disable flag)
}

export function STA(memory_location) {
    /*
    Store Accumulator
    M = A
    Stores the contents of the accumulator into memory.
    http://www.6502.org/users/obelisk/6502/reference.html#STA
    */
    mainMemory[memory_location] = cpuRegisters.a;
}

export function STX(memory_location) {
    /*
    Store X Register
    M = X
    Stores the contents of the X register into memory.
    http://www.6502.org/users/obelisk/6502/reference.html#STX
    */
    mainMemory[memory_location] = cpuRegisters.x;
}

export function STY(memory_location) {
    /*
    Store Y Register
    M = Y
    Stores the contents of the Y register into memory.
    http://www.6502.org/users/obelisk/6502/reference.html#STY
    */
    mainMemory[memory_location] = cpuRegisters.y;
}

export function TAX() {
    /*
    Transfer Accumulator to X
    X = A
    Copies the current contents of the accumulator into the X register and sets the zero and
    negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#TAX
    */
    cpuRegisters.x = cpuRegisters.a;
    // Set zero flag if value transfered is zero
    cpuRegisters.status = (cpuRegisters.x === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the value transfered is set
    cpuRegisters.status = (cpuRegisters.x & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function TAY() {
    /*
    Transfer Accumulator to Y
    Y = A
    Copies the current contents of the accumulator into the Y register and sets the zero and
    negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#TAY
    */
    cpuRegisters.y = cpuRegisters.a;
    // Set zero flag if value transfered is zero
    cpuRegisters.status = (cpuRegisters.y === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the value transfered is set
    cpuRegisters.status = (cpuRegisters.y & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function TSX() {
    /*
    Transfer Stack Pointer to X
    X = S
    Copies the current contents of the stack register into the X register and sets the zero and
    negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#TSX
    */
    cpuRegisters.x = cpuRegisters.sp;
    // Set zero flag if value transfered is zero
    cpuRegisters.status = (cpuRegisters.x === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the value transfered is set
    cpuRegisters.status = (cpuRegisters.x & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function TXA() {
    /*
    Transfer X to Accumulator
    A = X
    Copies the current contents of the X register into the accumulator and sets the zero and
    negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#TXA
    */
    cpuRegisters.a = cpuRegisters.x;
    // Set zero flag if value transfered is zero
    cpuRegisters.status = (cpuRegisters.a === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the value transfered is set
    cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

export function TXS() {
    /*
    Transfer X to Stack Pointer
    S = X
    Copies the current contents of the X register into the stack register.
    http://www.6502.org/users/obelisk/6502/reference.html#TXS
    */
    cpuRegisters.sp = cpuRegisters.x; // Store X register in stack pointer
}

export function TYA() {
    /*
    Transfer Y to Accumulator
    A = Y
    Copies the current contents of the Y register into the accumulator and sets the zero and
    negative flags as appropriate.
    http://www.6502.org/users/obelisk/6502/reference.html#TYA
    */
    cpuRegisters.a = cpuRegisters.y;
    // Set zero flag if value transfered is zero
    cpuRegisters.status = (cpuRegisters.a === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02);
    // Set negative flag if bit 7 of the value transfered is set
    cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80);
}

