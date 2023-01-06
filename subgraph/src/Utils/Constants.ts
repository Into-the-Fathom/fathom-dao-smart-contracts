import { BigDecimal, BigInt } from "@graphprotocol/graph-ts"

export class Constants{
    public static STAKING_CONTRACT:string = '0xEe948cf2DFf205f50F48BD7CC9B80aFE6303688A'
    public static STAKING_GETTER:string = '0xD0e108f0e6857dF03ABcCea1c75DeFF07Ef1e975'
    public static VFTHM:string = '0x1Df3e6C64dbeACb61f9974A9555a555EF8eC3791'

    public static GOVERNANCE:string = '0x786be460ad0b14Dc16D93f3065428f6b8fC0b00b'

    public static WAD:BigInt = BigInt.fromI64(10**18)
    public static RAY:BigInt = BigInt.fromI64( 10**27)
    public static RAD:BigInt = BigInt.fromI64( 10**45)

    public  static divByRAY(number: BigInt): BigInt {
        return number.div(Constants.WAD).div(BigInt.fromI64(10**9))
    }

    public  static divByRAYToDecimal(number: BigInt): BigDecimal {
        return number.toBigDecimal().div(Constants.WAD.toBigDecimal()).div(BigInt.fromI64(10**9).toBigDecimal())
    }

    public  static divByRAD(number: BigInt): BigInt {
        return number.div(Constants.WAD).div(Constants.WAD).div(BigInt.fromI64(10**9))
    }
}