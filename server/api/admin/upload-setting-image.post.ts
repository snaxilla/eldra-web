export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const baseUrl = String(config.public.directusUrl).replace(/\/$/, '')
  const token = String(config.directusToken || '')

  const form = await readMultipartFormData(event)
  const file = form?.find(f => f.name === 'file')

  if (!file) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No file uploaded'
    })
  }

  const formData = new FormData()
  formData.append(
    'file',
    new Blob([file.data], { type: file.type || 'application/octet-stream' }),
    file.filename || 'upload.bin'
  )

  const res = await fetch(`${baseUrl}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  })

  const json = await res.json()

  if (!res.ok) {
    throw createError({
      statusCode: res.status,
      statusMessage: json?.errors?.[0]?.message || json?.message || 'Failed to upload file'
    })
  }

  return {
    file_id: json.data.id
  }
})
