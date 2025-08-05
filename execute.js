import { cpuRegisters } from './main.js';
import { mainMemory } from './main.js';

// Lookup table for addressing mode handlers an their names in the opcode matrix
export const address_mode_handlers = {
    "A":    getAccumulator,
    "abs":  getAbsolute,
    "abs,X": getAbsoluteX,
    "abs,Y": getAbsoluteY,
    "#":    getImmediate,
    "impl": getImplied,
    "ind":  getIndirect,
    "X,ind": getXIndexedIndirect,
    "ind,Y": getIndirectYIndexed,
    "rel":  getRelative,
    "zpg":  getZeropage,
    "zpg,X": getZeropageXIndexed,
    "zpg,Y": getZeropageYIndexed
};


// Functions to handle the fetching of the operand based on the addressing mode of the instruction
// Addressing modes as described in https://www.masswerk.at/6502/6502_instruction_set.html:
/* 
A	    Accumulator	                OPC A	        operand is AC (implied single byte instruction)
abs	    absolute	                OPC $LLHH	    operand is address $HHLL *
abs,X	absolute, X-indexed         OPC $LLHH,X	    operand is address; effective address is address incremented by X with carry **
abs,Y	absolute, Y-indexed	        OPC $LLHH,Y	    operand is address; effective address is address incremented by Y with carry **
#	    immediate	                OPC #$BB	    operand is byte BB
impl	implied	                    OPC	            operand implied
ind	    indirect	                OPC ($LLHH)	    operand is address; effective address is contents of word at address: C.w($HHLL)
X,ind	X-indexed, indirect	        OPC ($LL,X)	    operand is zeropage address; effective address is word in (LL + X, LL + X + 1), inc. without carry: C.w($00LL + X)
ind,Y	indirect, Y-indexed	        OPC ($LL),Y	    operand is zeropage address; effective address is word in (LL, LL + 1) incremented by Y with carry: C.w($00LL) + Y
rel	    relative	                OPC $BB	        branch target is PC + signed offset BB ***
zpg	    zeropage	                OPC $LL	        operand is zeropage address (hi-byte is zero, address = $00LL)
zpg,X	zeropage, X-indexed	        OPC $LL,X	    operand is zeropage address; effective address is address incremented by X without carry **
zpg,Y	zeropage, Y-indexed	        OPC $LL,Y	    operand is zeropage address; effective address is address incremented by Y without carry **
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
    return ((operand2 << 8) | operand1)
}

export function getAbsoluteX(operand1, operand2) {
    /*
    OPC $LLHH,X
    operand is address; effective address is address incremented by X with carry
    Return the 16-bit address formed by combining the two bytes after shifting the second byte left by 8 bits and adding X
    */
    return (((operand2 << 8) | operand1) + cpuRegisters.x) & 0xFFFF;   // Ensure it wraps around at 0xFFFF
}

export function getAbsoluteY(operand1, operand2) {
    /*
    OPC $LLHH,Y
    operand is address; effective address is address incremented by Y with carry
    Return the 16-bit address formed by combining the two bytes after shifting the second byte left by 8 bits and adding Y
    */
    return (((operand2 << 8) | operand1) + cpuRegisters.y) & 0xFFFF;   // Ensure it wraps around at 0xFFFF
}

export function getImmediate(operand) {
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
    return the 16 bit address obtained from the memory address formed by combining the two bytes after shifting the second byte left by 8 bits
    */
    const address = ((operand2 << 8) | operand1) & 0xFFFF; // Address of the LSB of the word
    return (mainMemory[address] | (mainMemory[(address + 1) & 0xFFFF] << 8)) & 0xFFFF; // Read the word from memory and shift the MSB (at address+1) left by 8 bits
}

export function getXIndexedIndirect(operand) {
    /*
    OPC ($LL,X)
    operand is zeropage address; effective address is word in (LL + X, LL + X + 1), inc. without carry: C.w($00LL + X)
    return the 16 bit address obtained from memory address formed by adding X to the zeropage address operand
    */
    const address = (operand + cpuRegisters.x) & 0xFF; // Address of the LSB of the word
    return (mainMemory[address] | (mainMemory[(address + 1) & 0xFF] << 8)) & 0xFFFF; // Read the word from memory and shift the MSB (at address+1) left by 8 bits
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
    return the displacement to be applied to PC in case of takinf the branch as a signed number to avoid having to translate from 2s complement to signed in every branch function
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
    return the zeropage address calculated by adding the byte operand to the value of register X (The address calculation wraps around if the sum of the base address and the register exceed $FF)
    */
    return (operand + cpuRegisters.x) & 0xFF
}

export function getZeropageYIndexed(operand) {
    /*
    OPC $LL,Y
    operand is zeropage address; effective address is address incremented by Y without carry
    return the zeropage address calculated by adding the byte operand to the value of register Y (The address calculation wraps around if the sum of the base address and the register exceed $FF)
    */
    return (operand + cpuRegisters.y) & 0xFF
}



// Functions to handle the execution of instructions

export function ADC(memory_location) {
    /*
    Add with Carry
    A,Z,C,N = A+M+C
    This instruction adds the contents of a memory location to the accumulator together with the carry bit.
    If overflow occurs the carry bit is set, this enables multiple byte addition to be performed.
    http://www.6502.org/users/obelisk/6502/reference.html#ADC
    */
    const value = mainMemory[memory_location];
    const result = cpuRegisters.a + value + (cpuRegisters.status & 0x01); // Add accumulator, value of memory_location and carry if set
    cpuRegisters.status = (result > 0xFF) ? (cpuRegisters.status | 0x01) : (cpuRegisters.status & ~0x01); // Set carry flag if overflow
    cpuRegisters.a = result & 0xFF; // Store only the lower byte (ignore carry)
    cpuRegisters.status = (cpuRegisters.a === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02); // Set zero flag if result is zero
    cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80); // Set negative flag if result is negative

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
    cpuRegisters.status = (cpuRegisters.a === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02); // Set zero flag if result is zero
    cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80); // Set negative flag if result is negative
}

export function ASL(memory_location) {
    /*
    Arithmetic Shift Left
    A,Z,C,N = M*2 or M,Z,C,N = M*2
    This operation shifts all the bits of the accumulator or memory contents one bit left. Bit 0 is set to 0 and bit 7 is placed in the carry flag.
    The effect of this operation is to multiply the memory contents by 2 (ignoring 2's complement considerations), setting the carry if the result
    will not fit in 8 bits.
    http://www.6502.org/users/obelisk/6502/reference.html#ASL
    */
    // When the instruction has no arguments (1 byte instruction) the operation is performed on the accumulator 
    if (memory_location === null) {
        cpuRegisters.status = cpuRegisters.status & ~0x01; // Clear carry flag
        cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x01) : (cpuRegisters.status & ~0x01); // Set carry flag if bit 7 is set
        cpuRegisters.a = (cpuRegisters.a << 1) & 0xFF;  // Shift one bit left and store only the lower byte (ignore carry)
        cpuRegisters.status = (cpuRegisters.a === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02); // Set zero flag if result is zero
        cpuRegisters.status = (cpuRegisters.a & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80); // Set negative flag if result is negative
    } else {    // Operation is done on the contents of memory_location
        const value = mainMemory[memory_location];
        cpuRegisters.status = cpuRegisters.status & ~0x01; // Clear carry flag
        cpuRegisters.status = (value & 0x80) ? (cpuRegisters.status | 0x01) : (cpuRegisters.status & ~0x01); // Set carry flag if bit 7 is set
        mainMemory[memory_location] = (value << 1) & 0xFF;  // Shift one bit left and store only the lower byte (ignore carry)
        cpuRegisters.status = (mainMemory[memory_location] === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02); // Set zero flag if result is zero
        cpuRegisters.status = (mainMemory[memory_location] & 0x80) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80); // Set negative flag if result is negative
    }
}

export function BCC(displacement) {
    /*
    Branch if Carry Clear
    If the carry flag is clear then add the relative displacement to the program counter to cause a branch to a new location.
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
    If the carry flag is set then add the relative displacement to the program counter to cause a branch to a new location.
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
    If the zero flag is set then add the relative displacement to the program counter to cause a branch to a new location.
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
    This instructions is used to test if one or more bits are set in a target memory location. The mask pattern in A is ANDed with the value in memory
    to set or clear the zero flag, but the result is not kept. Bits 7 and 6 of the value from memory are copied into the N and V flags.
    http://www.6502.org/users/obelisk/6502/reference.html#BIT
    */
    const value = mainMemory[memory_location];
    const result = cpuRegisters.a & value;
    cpuRegisters.status = (result === 0x00) ? (cpuRegisters.status | 0x02) : (cpuRegisters.status & ~0x02); // Set zero flag if result is zero
    cpuRegisters.status = (value & 0x08) ? (cpuRegisters.status | 0x80) : (cpuRegisters.status & ~0x80); // Copy bit 7 of value to negative flag
    cpuRegisters.status = (value & 0x40) ? (cpuRegisters.status | 0x40) : (cpuRegisters.status & ~0x40); // Copy bit 6 of value to overflow flag
}

export function BMI(displacement) {
    /*
    Branch if Minus
    If the negative flag is set then add the relative displacement to the program counter to cause a branch to a new location.
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
    If the zero flag is clear then add the relative displacement to the program counter to cause a branch to a new location.
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
    If the negative flag is clear then add the relative displacement to the program counter to cause a branch to a new location.
    http://www.6502.org/users/obelisk/6502/reference.html#BPL
    */
    if (!(cpuRegisters.status & 0x80)) { // Check if negative flag is clear
        const new_pc = cpuRegisters.pc + displacement; // Calculate program counter after branch
        cpuRegisters.pc = new_pc & 0xFFFF; // Update program counter, ensuring it wraps around at 0xFFFF
    }
}

// export function BRK TODO: interrumpts

export function BVC(displacement) {
    /*
    Branch if Overflow Clear
    If the overflow flag is clear then add the relative displacement to the program counter to cause a branch to a new location.
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
    If the overflow flag is set then add the relative displacement to the program counter to cause a branch to a new location.
    http://www.6502.org/users/obelisk/6502/reference.html#BVS
    */
    if (cpuRegisters.status & 0x04) { // Check if overflow flag is set
        const new_pc = cpuRegisters.pc + displacement; // Calculate program counter after branch
        cpuRegisters.pc = new_pc & 0xFFFF; // Update program counter, ensuring it wraps around at 0xFFFF
    }
}