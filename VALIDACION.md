# Validación de la beta 0.2.0

Las pruebas automatizadas verifican reglas de seguridad, autenticación, CSRF, aislamiento de espacios, cifrado de claves, exportación sin secretos, contratos de los cuatro proveedores, límites, bajas, errores de cuota y ausencia de respuestas después de pausar.

También comprueban bloqueo de redes privadas y metadatos, respeto de robots.txt, lectura de sitemap/enlaces internos, recuperación de información de las páginas y filtrado de campos de API sin exponer su autorización. Se probó una lectura real de dos páginas públicas de iaquetrabaja.com; el resultado se marcó parcial al limitarlo deliberadamente a dos páginas.

Los contratos de proveedores se prueban con respuestas simuladas. Una prueba simulada no demuestra que una clave real tenga saldo o cuota. Las comprobaciones reales de proveedores y del QR se registran por separado en el informe de entrega; no se guardan claves en este repositorio.

Se generó un QR real en el contenedor alojado utilizando el adaptador con almacenamiento cifrado, sin vincular un número ni enviar mensajes. Desde el constructor de la instalación de prueba se indexaron 88 páginas públicas de iaquetrabaja.com (501.039 caracteres extraídos), sin marcar el resultado como parcial. Se verificó además un GET real al catálogo JSON de Tools y su filtrado de campos.

La recepción final de respuestas en un segundo teléfono y la persistencia de una cuenta ya vinculada requieren que el propietario escanee el QR con un número de prueba. No se encontró una clave Gemini existente para realizar una inferencia real; las pruebas de los cuatro proveedores utilizaron respuestas simuladas. Hay que introducir una clave propia y probarla antes de dar por validada una conversación completa.

No se deben presentar llamadas simuladas, QR sin escanear o aceptación de un envío como una conversación completa verificada ni una garantía de estabilidad continua.
