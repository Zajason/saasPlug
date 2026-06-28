import express, { Request, Response } from "express"
import prisma from "../prisma/client.ts"
import { makeErrorLog } from "../middleware/errorHandler.ts"
import { verifyToken } from "../middleware/verifyToken.ts"
import { CarColor } from "@prisma/client"

const router = express.Router()
const handleGetOwnerships = async (req: Request, res: Response) => {
    try {
      const userId = req.userId
      if (!userId) {
        return res
          .status(401)
          .json({ error: "Unauthorized: missing user ID in token" })
      }
  
      const ownerships = await prisma.carOwnership.findMany({
        where: { userId },
        include: {
          car: true, // include the linked Car model details
        },
        orderBy: {
          createdAt: "desc",
        },
      })
  
      return res.status(200).json(ownerships)
    } catch (err: any) {
      const errorLog = makeErrorLog(
        req,
        500,
        "Internal server error while fetching car ownerships",
        err.message
      )
      return res.status(500).json(errorLog)
    }
  }
  
// POST /api/car-ownership/:carId
// Body: { color: "RED" }
const handleAddOwnership = async (req: Request, res: Response) => {
  try {
    const carId = Number(req.params.carId)
    if (isNaN(carId)) {
      const err = makeErrorLog(req, 400, `Invalid car id '${req.params.carId}'`)
      return res.status(400).json(err)
    }

    const userId = req.userId
    if (!userId) {
      return res
        .status(401)
        .json({ error: "Unauthorized: missing user ID in token" })
    }

    const { color } = req.body
    if (!color || !(color.toUpperCase() in CarColor)) {
      const validColors = Object.keys(CarColor)
      const err = makeErrorLog(
        req,
        400,
        `Invalid or missing color (valid: ${validColors.join(", ")})`
      )
      return res.status(400).json(err)
    }

    // confirm car exists
    const carExists = await prisma.car.findUnique({ where: { id: carId } })
    if (!carExists) {
      const err = makeErrorLog(req, 404, `Car ${carId} not found`)
      return res.status(404).json(err)
    }

    // Optional: prevent duplicate ownership
    const existing = await prisma.carOwnership.findFirst({
      where: { userId, carId },
    })
    if (existing) {
      const err = makeErrorLog(
        req,
        409,
        `User already owns this car model (id ${carId})`
      )
      return res.status(409).json(err)
    }

    const ownership = await prisma.carOwnership.create({
      data: {
        userId,
        carId,
        color: color.toUpperCase() as CarColor,
      },
      include: {
        car: true,
      },
    })

    return res.status(201).json({
      message: "Car ownership created successfully",
      ownership,
    })
  } catch (err: any) {
    const errorLog = makeErrorLog(
      req,
      500,
      "Internal server error during car ownership creation",
      err.message
    )
    return res.status(500).json(errorLog)
  }
}

const handleDeleteOwnership = async (req: Request, res: Response) => {
  try {
    const ownershipId = Number(req.params.ownershipId)
    if (isNaN(ownershipId)) {
      const err = makeErrorLog(
        req,
        400,
        `Invalid ownership id '${req.params.ownershipId}'`
      )
      return res.status(400).json(err)
    }

    const userId = req.userId
    if (!userId) {
      return res
        .status(401)
        .json({ error: "Unauthorized: missing user ID in token" })
    }

    const ownership = await prisma.carOwnership.findUnique({
      where: { id: ownershipId },
      select: { id: true, userId: true },
    })

    if (!ownership || ownership.userId !== userId) {
      const err = makeErrorLog(
        req,
        404,
        `Vehicle ownership ${ownershipId} not found for this user`
      )
      return res.status(404).json(err)
    }

    await prisma.carOwnership.delete({ where: { id: ownershipId } })

    return res
      .status(200)
      .json({ message: "Car ownership deleted successfully" })
  } catch (err: any) {
    const errorLog = makeErrorLog(
      req,
      500,
      "Internal server error while deleting car ownership",
      err.message
    )
    return res.status(500).json(errorLog)
  }
}

router.post("/:carId", verifyToken, handleAddOwnership)
router.delete("/:ownershipId", verifyToken, handleDeleteOwnership)
router.get("/", verifyToken, handleGetOwnerships)

export default router