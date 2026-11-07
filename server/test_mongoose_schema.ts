import mongoose, { Schema } from 'mongoose'

const testSchema = new Schema({
  locationEnabled: { type: Boolean, default: false },
  encryptedLocation: {
    type: {
      version: { type: Number, default: 1 },
      iv: { type: String, required: true },
      authTag: { type: String, required: true },
      ciphertext: { type: String, required: true },
    },
    default: null,
  },
})

const Test = mongoose.model('TestSchema', testSchema)
const doc = new Test({
  locationEnabled: true,
  encryptedLocation: {
    version: 1,
    iv: '123456789012345678901234',
    authTag: '12345678901234567890123456789012',
    ciphertext: 'abcdef',
  },
})

console.log('Resulting doc:', JSON.stringify(doc.toObject(), null, 2))
console.log('doc.encryptedLocation:', doc.encryptedLocation)
console.log('doc.encryptedLocation.iv:', (doc.encryptedLocation as any)?.iv)

