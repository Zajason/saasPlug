import { PrismaClient, ConnectorType, Prisma } from '@prisma/client'
import fs from 'fs'
import { parse } from 'csv-parse/sync'

const prisma = new PrismaClient()

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

/**
 * Split comma-separated port values and normalize them
 */
function portsNormalize(val: string): ConnectorType[] {
  if (!val) return []

  return val
    .split(',')
    .map((p: string) => p.trim().toUpperCase())
    .filter((p): p is ConnectorType =>
      ['CCS', 'CHADEMO', 'TYPE2', 'TYPE1', 'SCHUKO'].includes(p)
    )
}

async function main() {
  const filePath = new URL('../data/ev_models_battery_variants.csv', import.meta.url)
  const fileContent = fs.readFileSync(filePath, 'utf8')

  const rows = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[]

  console.log(`Parsed ${rows.length} rows from CSV`)

  const cars = rows.map((row): Omit<Parameters<typeof prisma.car.create>[0]['data'], 'id'> => {
    let dcChargingCurve: Prisma.InputJsonValue = []
    try {
      const parsed = JSON.parse(row.DC_Charging_Curve.replace(/""/g, '"')) as Prisma.JsonValue
      dcChargingCurve = Array.isArray(parsed) ? parsed : []
    } catch {
      dcChargingCurve = []
    }

    const dcCurveIsDefault = row.DC_Curve_Is_Default.toLowerCase() === 'true'

    return {
      brand: row.Brand,
      model: row.Model,
      variant: row.Variant || null,
      usableBatteryKWh: parseFloat(row.Usable_Battery_kWh),
      acMaxKW: parseFloat(row.AC_Max_kW),
      dcMaxKW: parseFloat(row.DC_Max_kW),
      dcChargingCurve,
      dcCurveIsDefault,
      dcPorts: portsNormalize(row.DC_Ports),
      acPorts: portsNormalize(row.AC_Ports),
    }
  })

  const batchSize = 100
  for (let i = 0; i < cars.length; i += batchSize) {
    const batch = cars.slice(i, i + batchSize)
    await prisma.car.createMany({ data: batch, skipDuplicates: true })
    console.log(`Inserted batch ${i / batchSize + 1}`)
  }

  console.log('✅ Car seeding complete.')
}

main()
  .catch(err => {
    console.error('❌ Error seeding cars:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })