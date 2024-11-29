import { BentoCache, bentostore } from 'bentocache'
import { memoryDriver } from 'bentocache/drivers/memory'
import { redisDriver } from 'bentocache/drivers/redis'
import { redisQueueConnection } from './workers/redisSetup'

export const cache = new BentoCache({
  default: 'multitier',
  stores: {
    // A second cache store named "multitier" using
    // a in-memory cache as L1 and a Redis cache as L2
    multitier: bentostore()
      .useL1Layer(memoryDriver({ maxSize: 10_000 }))
      .useL2Layer(redisDriver({
        connection: redisQueueConnection
      }))
  }
})