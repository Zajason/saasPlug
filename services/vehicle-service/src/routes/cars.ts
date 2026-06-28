// back-end/src/routes/cars.routes.ts
import { Router } from 'express'
import { searchCars } from '../controllers/carsController.ts'

const router = Router()

router.get('/search', searchCars)

export default router