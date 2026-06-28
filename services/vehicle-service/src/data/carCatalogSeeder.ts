import { ConnectorType, Prisma, PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import { parse } from 'csv-parse/sync'

interface CsvRow {
  Brand: string
  Model: string
  Variant?: string
  Usable_Battery_kWh: string
  AC_Max_kW: string
  DC_Max_kW: string
  DC_Charging_Curve: string
  DC_Curve_Is_Default: string
  DC_Ports: string
  AC_Ports: string
}

let ensured = false
let seedingPromise: Promise<void> | null = null
const targetCatalogCount = 120
const popularEvBrands = [
  'Tesla',
  'Volkswagen',
  'BMW',
  'Mercedes-Benz',
  'Audi',
  'Hyundai',
  'Kia',
  'Nissan',
  'Renault',
  'Peugeot',
  'Opel',
  'Volvo',
  'Polestar',
  'Porsche',
  'Ford',
  'Skoda',
  'Cupra',
  'MG',
  'BYD',
  'Fiat',
  'Mini',
  'Smart',
  'Honda',
  'Toyota',
  'Lexus',
  'Jeep',
  'Dacia',
  'Citroen',
  'Citroën',
]

function normalizePorts(value: string): ConnectorType[] {
  if (!value) return []

  return value
    .split(',')
    .map(port => port.trim().toUpperCase())
    .filter((port): port is ConnectorType =>
      ['CCS', 'CHADEMO', 'TYPE2', 'TYPE1', 'SCHUKO'].includes(port),
    )
}

function parseNumber(value: string): number {
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function carKey(car: { brand: string; model: string; variant?: string | null }) {
  return `${car.brand.trim().toLowerCase()}|${car.model.trim().toLowerCase()}|${(car.variant ?? '').trim().toLowerCase()}`
}

export async function ensureCarCatalogSeeded(prisma: PrismaClient) {
  if (ensured) return
  if (seedingPromise) return seedingPromise

  seedingPromise = (async () => {
    const existingCars = await prisma.car.findMany({
      select: { brand: true, model: true, variant: true },
    })
    if (existingCars.length >= targetCatalogCount) {
      ensured = true
      return
    }
    const existingKeys = new Set(existingCars.map(carKey))

    const csvUrl = new URL('./ev_models_battery_variants.csv', import.meta.url)
    const fileContent = fs.readFileSync(csvUrl, 'utf8')
    const rows = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as CsvRow[]

    const grouped = new Map<string, Array<ReturnType<typeof mapRow>>>()
    function mapRow(row: CsvRow) {
      let dcChargingCurve: Prisma.InputJsonValue = []
      try {
        const sanitized = row.DC_Charging_Curve.replace(/""/g, '"')
        const parsed = JSON.parse(sanitized) as Prisma.JsonValue
        dcChargingCurve = Array.isArray(parsed) ? parsed : []
      } catch {
        dcChargingCurve = []
      }

      const dcCurveIsDefault = row.DC_Curve_Is_Default?.toLowerCase() === 'true'

      return {
        brand: row.Brand,
        model: row.Model,
        variant: row.Variant || null,
        usableBatteryKWh: parseNumber(row.Usable_Battery_kWh),
        acMaxKW: parseNumber(row.AC_Max_kW),
        dcMaxKW: parseNumber(row.DC_Max_kW),
        dcChargingCurve,
        dcCurveIsDefault,
        dcPorts: normalizePorts(row.DC_Ports),
        acPorts: normalizePorts(row.AC_Ports),
      }
    }

    for (const row of rows) {
      if (!popularEvBrands.includes(row.Brand)) continue
      const car = mapRow(row)
      if (existingKeys.has(carKey(car))) continue
      const list = grouped.get(car.brand) ?? []
      list.push(car)
      grouped.set(car.brand, list)
    }

    const cars: Array<ReturnType<typeof mapRow>> = []
    while (existingCars.length + cars.length < targetCatalogCount) {
      let addedThisRound = false
      for (const brand of popularEvBrands) {
        const next = grouped.get(brand)?.shift()
        if (!next) continue
        const key = carKey(next)
        if (existingKeys.has(key)) continue
        existingKeys.add(key)
        cars.push(next)
        addedThisRound = true
        if (existingCars.length + cars.length >= targetCatalogCount) break
      }
      if (!addedThisRound) break
    }

    const batchSize = 150
    for (let i = 0; i < cars.length; i += batchSize) {
      const batch = cars.slice(i, i + batchSize)
      await prisma.car.createMany({ data: batch, skipDuplicates: true })
    }

    ensured = true
  })()

  try {
    await seedingPromise
  } finally {
    seedingPromise = null
  }
}
