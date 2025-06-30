// Prototype for the object representing an opcode in the 6502 CPU
class OpCode {
    constructor(instruction_name, addressing_mode, size) {
        this.instruction_name = instruction_name;   // Name of the instruction in a 3 letter string format
        this.addressing_mode = addressing_mode; // Addressing mode as a string
        this.size = size; // Size in bytes from 1 to 3
        // TODO: add cycles needed to execute the instruction for timing purposes
        // this.cycles = cycles;   // Number of cycles needed to execute the instruction
        // TODO: add function pointers to the instruction/addressing mode combination once implemented
    }
}

// Opcode matrix for the 6502 CPU as seen in https://www.masswerk.at/6502/6502_instruction_set.html#JSR
// Instruction sizes are also included in the reference
// Only legal opcodes are included for now

// Addressing modes as described in https://www.masswerk.at/6502/6502_instruction_set.html#JSR:
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

// TODO: move to a JSON file instead of hardcoding the opcodes in the code???

export const opcode_matrix = {
    0x00: new OpCode("BRK", "impl", 1),
    0x01: new OpCode("ORA", "X,ind", 2),
    0x05: new OpCode("ORA", "zpg", 2),
    0x06: new OpCode("ASL", "zpg", 2),
    0x08: new OpCode("PHP", "impl", 1),
    0x09: new OpCode("ORA", "#", 2),
    0x0A: new OpCode("ASL", "A", 1),
    0x0D: new OpCode("ORA", "abs", 3),
    0x0E: new OpCode("ASL", "abs", 3),
    0x10: new OpCode("BPL", "rel", 2),
    0x11: new OpCode("ORA", "ind,Y", 2),
    0x15: new OpCode("ORA", "zpg,X", 2),
    0x16: new OpCode("ASL", "zpg,X", 2),
    0x18: new OpCode("CLC", "impl", 1),
    0x19: new OpCode("ORA", "abs,Y", 3),
    0x1D: new OpCode("ORA", "abs,X", 3),
    0x1E: new OpCode("ASL", "abs,X", 3),
    0x20: new OpCode("JSR", "abs", 3),
    0x21: new OpCode("AND", "X,ind", 2),
    0x24: new OpCode("BIT", "zpg", 2),
    0x25: new OpCode("AND", "zpg", 2),
    0x26: new OpCode("ROL", "zpg", 2),
    0x28: new OpCode("PLP", "impl", 1),
    0x29: new OpCode("AND", "#", 2),
    0x2A: new OpCode("ROL", "A", 1),
    0x2C: new OpCode("BIT", "abs", 3),
    0x2D: new OpCode("AND", "abs", 3),
    0x2E: new OpCode("ROL", "abs", 3),
    0x30: new OpCode("BMI", "rel", 2),
    0x31: new OpCode("AND", "ind,Y", 2),
    0x35: new OpCode("AND", "zpg,X", 2),
    0x36: new OpCode("ROL", "zpg,X", 2),
    0x38: new OpCode("SEC", "impl", 1),
    0x39: new OpCode("AND", "abs,Y", 3),
    0x3D: new OpCode("AND", "abs,X", 3),
    0x3E: new OpCode("ROL", "abs,X", 3),
    0x40: new OpCode("RTI", "impl", 1),
    0x41: new OpCode("EOR", "X,ind", 2),
    0x45: new OpCode("EOR", "zpg", 2),
    0x46: new OpCode("LSR", "zpg", 2),
    0x48: new OpCode("PHA", "impl", 1),
    0x49: new OpCode("EOR", "#", 2),
    0x4A: new OpCode("LSR", "A", 1),
    0x4C: new OpCode("JMP", "abs", 3),
    0x4D: new OpCode("EOR", "abs", 3),
    0x4E: new OpCode("LSR", "abs", 3),
    0x50: new OpCode("BVC", "rel", 2),
    0x51: new OpCode("EOR", "ind,Y", 2),
    0x55: new OpCode("EOR", "zpg,X", 2),
    0x56: new OpCode("LSR", "zpg,X", 2),
    0x58: new OpCode("CLI", "impl", 1),
    0x59: new OpCode("EOR", "abs,Y", 3),
    0x5D: new OpCode("EOR", "abs,X", 3),
    0x5E: new OpCode("LSR", "abs,X", 3),
    0x60: new OpCode("RTS", "impl", 1),
    0x61: new OpCode("ADC", "X,ind", 2),
    0x65: new OpCode("ADC", "zpg", 2),
    0x66: new OpCode("ROR", "zpg", 2),
    0x68: new OpCode("PLA", "impl", 1),
    0x69: new OpCode("ADC", "#", 2),
    0x6A: new OpCode("ROR", "A", 1),
    0x6C: new OpCode("JMP", "ind", 3),
    0x6D: new OpCode("ADC", "abs", 3),
    0x6E: new OpCode("ROR", "abs", 3),
    0x70: new OpCode("BVS", "rel", 2),
    0x71: new OpCode("ADC", "ind,Y", 2),
    0x75: new OpCode("ADC", "zpg,X", 2),
    0x76: new OpCode("ROR", "zpg,X", 2),
    0x78: new OpCode("SEI", "impl", 1),
    0x79: new OpCode("ADC", "abs,Y", 3),
    0x7D: new OpCode("ADC", "abs,X", 3),
    0x7E: new OpCode("ROR", "abs,X", 3),
    0x81: new OpCode("STA", "X,ind", 2),
    0x84: new OpCode("STY", "zpg", 2),
    0x85: new OpCode("STA", "zpg", 2),
    0x86: new OpCode("STX", "zpg", 2),
    0x88: new OpCode("DEY", "impl", 1),
    0x8A: new OpCode("TXA", "impl", 1),
    0x8C: new OpCode("STY", "abs", 3),
    0x8D: new OpCode("STA", "abs", 3),
    0x8E: new OpCode("STX", "abs", 3),
    0x90: new OpCode("BCC", "rel", 2),
    0x91: new OpCode("STA", "ind,Y", 2),
    0x94: new OpCode("STY", "zpg,X", 2),
    0x95: new OpCode("STA", "zpg,X", 2),
    0x96: new OpCode("STX", "zpg,Y", 2),
    0x98: new OpCode("TYA", "impl", 1),
    0x99: new OpCode("STA", "abs,Y", 3),
    0x9A: new OpCode("TXS", "impl", 1),
    0x9D: new OpCode("STA", "abs,X", 3),
    0xA0: new OpCode("LDY", "#", 2),
    0xA1: new OpCode("LDA", "X,ind", 2),
    0xA2: new OpCode("LDX", "#", 2),
    0xA4: new OpCode("LDY", "zpg", 2),
    0xA5: new OpCode("LDA", "zpg", 2),
    0xA6: new OpCode("LDX", "zpg", 2),
    0xA8: new OpCode("TAY", "impl", 1),
    0xA9: new OpCode("LDA", "#", 2),
    0xAA: new OpCode("TAX", "impl", 1),
    0xAC: new OpCode("LDY", "abs", 3),
    0xAD: new OpCode("LDA", "abs", 3),
    0xAE: new OpCode("LDX", "abs", 3),
    0xB0: new OpCode("BCS", "rel", 2),
    0xB1: new OpCode("LDA", "ind,Y", 2),
    0xB4: new OpCode("LDY", "zpg,X", 2),
    0xB5: new OpCode("LDA", "zpg,X", 2),
    0xB6: new OpCode("LDX", "zpg,Y", 2),
    0xB8: new OpCode("CLV", "impl", 1),
    0xB9: new OpCode("LDA", "abs,Y", 3),
    0xBA: new OpCode("TSX", "impl", 1),
    0xBC: new OpCode("LDY", "abs,X", 3),
    0xBD: new OpCode("LDA", "abs,X", 3),
    0xBE: new OpCode("LDX", "abs,Y", 3),
    0xC0: new OpCode("CPY", "#", 2),
    0xC1: new OpCode("CMP", "X,ind", 2),
    0xC4: new OpCode("CPY", "zpg", 2),
    0xC5: new OpCode("CMP", "zpg", 2),
    0xC6: new OpCode("DEC", "zpg", 2),
    0xC8: new OpCode("INY", "impl", 1),
    0xC9: new OpCode("CMP", "#", 2),
    0xCA: new OpCode("DEX", "impl", 1),
    0xCC: new OpCode("CPY", "abs", 3),
    0xCD: new OpCode("CMP", "abs", 3),
    0xCE: new OpCode("DEC", "abs", 3),
    0xD0: new OpCode("BNE", "rel", 2),
    0xD1: new OpCode("CMP", "ind,Y", 2),
    0xD5: new OpCode("CMP", "zpg,X", 2),
    0xD6: new OpCode("DEC", "zpg,X", 2),
    0xD8: new OpCode("CLD", "impl", 1),
    0xD9: new OpCode("CMP", "abs,Y", 3),
    0xDD: new OpCode("CMP", "abs,X", 3),
    0xDE: new OpCode("DEC", "abs,X", 3),
    0xE0: new OpCode("CPX", "#", 2),
    0xE1: new OpCode("SBC", "X,ind", 2),
    0xE4: new OpCode("CPX", "zpg", 2),
    0xE5: new OpCode("SBC", "zpg", 2),
    0xE6: new OpCode("INC", "zpg", 2),
    0xE8: new OpCode("INX", "impl", 1),
    0xE9: new OpCode("SBC", "#", 2),
    0xEA: new OpCode("NOP", "impl", 1),
    0xEC: new OpCode("CPX", "abs", 3),
    0xED: new OpCode("SBC", "abs", 3),
    0xEE: new OpCode("INC", "abs", 3),
    0xF0: new OpCode("BEQ", "rel", 2),
    0xF1: new OpCode("SBC", "ind,Y", 2),
    0xF5: new OpCode("SBC", "zpg,X", 2),
    0xF6: new OpCode("INC", "zpg,X", 2),
    0xF8: new OpCode("SED", "impl", 1),
    0xF9: new OpCode("SBC", "abs,Y", 3),
    0xFD: new OpCode("SBC", "abs,X", 3),
    0xFE: new OpCode("INC", "abs,X", 3)
}

    