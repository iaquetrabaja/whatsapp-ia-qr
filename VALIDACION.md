# Validación de la beta 0.2.0

Las pruebas automatizadas verifican reglas de seguridad, autenticación, CSRF, aislamiento de espacios, cifrado de claves, exportación sin secretos, contratos de los cuatro proveedores, límites, bajas, errores de cuota y ausencia de respuestas después de pausar.

Los contratos de proveedores se prueban con respuestas simuladas. Una prueba simulada no demuestra que una clave real tenga saldo o cuota. Las comprobaciones reales de proveedores y del QR se registran por separado en el informe de entrega; no se guardan claves en este repositorio.

En la versión anterior se generó un QR real sin vincular un número y sin enviar mensajes. La nueva persistencia cifrada también debe comprobarse contra la conexión real antes de declararla validada. La recepción final de respuestas en un segundo teléfono requiere que el propietario vincule un número de prueba.

No se deben presentar llamadas simuladas, QR sin escanear o aceptación de un envío como una conversación completa verificada ni una garantía de estabilidad continua.
