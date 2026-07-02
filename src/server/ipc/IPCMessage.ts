import { IPCDataType } from "@/enums/server/ipc/IPCDataType";
import { IPCMessageType } from "@/enums/server/ipc/IPCMessageType";
import { IPCMessageParam } from "@/server/ipc/IPCMessageParam";

/**
 * Represents an IPCMessage.
 */
export class IPCMessage {
  /**
   * The size of the header of the IPCMessage.
   */
  static HeaderSize = 6;
  /**
   * The parameters of the IPCMessage.
   */
  #params: IPCMessageParam[] = [];
  /**
   * The type of the IPCMessage.
   */
  type: IPCMessageType;
  /**
   * The sub type of the IPCMessage
   */
  subType: number;
  /**
   * The size of the data of the IPCMessage.
   */
  dataSize: number = 0;
  /**
   * The number of parameters in the IPCMessage.
   */
  paramCount: number = 0;

  constructor(type: IPCMessageType, subType: number = 0){
    this.type = type;
    this.subType = subType;
  }
  
  /**
   * Adds a parameter to the IPCMessage.
   * @param param The parameter to add.
   */
  addParam(param: IPCMessageParam){
    this.#params.push(param);
    this.dataSize += param.size;
    this.paramCount++;
  }

  /**
   * Gets a parameter from the IPCMessage.
   * @param index The index of the parameter to get.
   * @returns The parameter.
   */
  getParam(index: number): IPCMessageParam {
    return this.#params[index];
  }

  /** Fluent builders — append a typed parameter and return this. */
  addInt(value: number): this {
    this.addParam(new IPCMessageParam(IPCDataType.INTEGER, value | 0));
    return this;
  }

  addFloat(value: number): this {
    this.addParam(new IPCMessageParam(IPCDataType.FLOAT, value));
    return this;
  }

  addString(value: string): this {
    this.addParam(new IPCMessageParam(IPCDataType.STRING, value));
    return this;
  }

  addObjectId(value: number): this {
    this.addParam(new IPCMessageParam(IPCDataType.OBJECT_ID, value | 0));
    return this;
  }

  addVoidBytes(value: Uint8Array): this {
    this.addParam(new IPCMessageParam(IPCDataType.VOID, value));
    return this;
  }

  /** Typed readers by parameter index. */
  intAt(index: number): number { return this.#params[index]?.getInt32() ?? 0; }
  floatAt(index: number): number { return this.#params[index]?.getFloat() ?? 0; }
  stringAt(index: number): string { return this.#params[index]?.getString() ?? ''; }
  objectIdAt(index: number): number { return this.#params[index]?.getObjectId() ?? 0; }

  /**
   * Converts the IPCMessage to an output buffer.
   * @returns The buffer.
   */
  toBuffer(): Uint8Array {
    const buffer = new Uint8Array(IPCMessage.HeaderSize + this.dataSize);
    const view = new DataView(buffer.buffer);
    view.setUint16(0, this.type, true);
    view.setUint16(2, this.subType, true);
    view.setUint16(4, this.paramCount, true);
    let offset = IPCMessage.HeaderSize;
    for(let i = 0; i < this.#params.length; i++){
      const param = this.#params[i];
      buffer.set(param.toBuffer(), offset);
      offset += param.size;
    }
    return buffer;
  }

  /**
   * Restores the IPCMessage from a buffer.
   * @param buffer The buffer to restore from.
   * @returns The restored IPCMessage.
   */
  static fromBuffer(buffer: Uint8Array): IPCMessage {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const message = new IPCMessage(view.getUint16(0, true) as IPCMessageType, view.getUint16(2, true));
    const paramCount = view.getUint16(4, true);
    let offset = IPCMessage.HeaderSize;
    for(let i = 0; i < paramCount; i++){
      /**
       * Extract the data size from the buffer.
       */
      const dataSize = view.getUint32(offset + 4, true);
      /**
       * Calculate the total size of the parameter.
       */
      const paramSize = IPCMessageParam.HeaderSize + dataSize;
      /**
       * Restore the parameter from the buffer.
       */
      const param = IPCMessageParam.fromBuffer(buffer.slice(offset, offset + paramSize));
      message.addParam(param);
      /**
       * Move the offset to the next parameter.
       */
      offset += paramSize;
    }
    return message;
  }
}
