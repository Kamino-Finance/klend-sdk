import { address, Address } from "@solana/kit" // eslint-disable-line @typescript-eslint/no-unused-vars
import BN from "bn.js" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as types from "../types" // eslint-disable-line @typescript-eslint/no-unused-vars
import * as borsh from "@coral-xyz/borsh"
import { borshAddress } from "../utils"

export interface WithdrawQueueFields {
  queuedCollateralAmount: BN
  nextIssuedTicketSequenceNumber: BN
  nextWithdrawableTicketSequenceNumber: BN
}

export interface WithdrawQueueJSON {
  queuedCollateralAmount: string
  nextIssuedTicketSequenceNumber: string
  nextWithdrawableTicketSequenceNumber: string
}

export class WithdrawQueue {
  readonly queuedCollateralAmount: BN
  readonly nextIssuedTicketSequenceNumber: BN
  readonly nextWithdrawableTicketSequenceNumber: BN

  constructor(fields: WithdrawQueueFields) {
    this.queuedCollateralAmount = fields.queuedCollateralAmount
    this.nextIssuedTicketSequenceNumber = fields.nextIssuedTicketSequenceNumber
    this.nextWithdrawableTicketSequenceNumber =
      fields.nextWithdrawableTicketSequenceNumber
  }

  static layout(property?: string) {
    return borsh.struct(
      [
        borsh.u64("queuedCollateralAmount"),
        borsh.u64("nextIssuedTicketSequenceNumber"),
        borsh.u64("nextWithdrawableTicketSequenceNumber"),
      ],
      property
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromDecoded(obj: any) {
    return new WithdrawQueue({
      queuedCollateralAmount: obj.queuedCollateralAmount,
      nextIssuedTicketSequenceNumber: obj.nextIssuedTicketSequenceNumber,
      nextWithdrawableTicketSequenceNumber:
        obj.nextWithdrawableTicketSequenceNumber,
    })
  }

  static toEncodable(fields: WithdrawQueueFields) {
    return {
      queuedCollateralAmount: fields.queuedCollateralAmount,
      nextIssuedTicketSequenceNumber: fields.nextIssuedTicketSequenceNumber,
      nextWithdrawableTicketSequenceNumber:
        fields.nextWithdrawableTicketSequenceNumber,
    }
  }

  toJSON(): WithdrawQueueJSON {
    return {
      queuedCollateralAmount: this.queuedCollateralAmount.toString(),
      nextIssuedTicketSequenceNumber:
        this.nextIssuedTicketSequenceNumber.toString(),
      nextWithdrawableTicketSequenceNumber:
        this.nextWithdrawableTicketSequenceNumber.toString(),
    }
  }

  static fromJSON(obj: WithdrawQueueJSON): WithdrawQueue {
    return new WithdrawQueue({
      queuedCollateralAmount: new BN(obj.queuedCollateralAmount),
      nextIssuedTicketSequenceNumber: new BN(
        obj.nextIssuedTicketSequenceNumber
      ),
      nextWithdrawableTicketSequenceNumber: new BN(
        obj.nextWithdrawableTicketSequenceNumber
      ),
    })
  }

  toEncodable() {
    return WithdrawQueue.toEncodable(this)
  }
}
