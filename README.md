# WhatsApp con IA por QR · IA que trabaja

Plataforma abierta de automatizaciones de WhatsApp con **Gemini, Groq, modelos gratuitos de OpenRouter y OpenAI mediante API**. Vincula tu número mediante QR, prepara el contexto del negocio, prueba respuestas y activa el flujo. También puedes desplegarla en tu propio servidor. No utiliza modelos locales.

**Estado: beta 0.2.0.** La conexión de WhatsApp es no oficial y depende de [Baileys](https://github.com/WhiskeySockets/Baileys), con licencia MIT. Puede desconectarse o causar restricciones del número. No hay garantía anti-baneo. No se ofrece envío masivo ni captación no solicitada.

## Qué puedes montar

- Un asistente de soporte que responde utilizando los datos de tu negocio.
- Un asesor de productos que explica lo que realmente ofreces.
- Un flujo para recoger solicitudes de cita, sin inventar disponibilidad ni confirmar reservas.
- Activación con todos los mensajes privados nuevos o solo si incluyen una palabra.
- Hasta tres flujos guardados y un flujo activo por número.
- Prueba del modelo sin enviar mensajes a WhatsApp.
- QR de conexión, pausa, atención humana, bajas, límites y registro de actividad.
- Exportación/importación de flujos, sin claves, teléfonos de prueba ni sesión vinculada.

No es todavía un constructor de acciones arbitrarias. No ejecuta reservas, pedidos, pagos, webhooks ni herramientas externas. La IA redacta respuestas. El siguiente paso para integrar acciones debe incluir permisos y validación de cada operación.

## Dos formas de usarlo

**En Tools:** cada usuario verificado entra con su cuenta, dispone de su espacio y aporta su clave del proveedor. La identidad la verifica el servicio interno de cuentas; no se aceptan cabeceras de identidad del navegador. La beta alojada tiene un límite global de dos conexiones simultáneas para proteger el servidor actual y está sin listar en portada.

**En tu servidor:** usa Docker Compose, una contraseña propia y un volumen persistente. No necesitas una cuenta en IA que trabaja. Puedes importar los flujos exportados desde Tools. Las claves y el QR se configuran de nuevo en tu instalación.

## Desplegar en tu servidor

Requisitos: Docker con Compose, acceso al servidor y una clave de alguno de los proveedores. Sin GPU ni instalación de modelos.

```sh
git clone https://github.com/iaquetrabaja/whatsapp-ia-qr.git
cd whatsapp-ia-qr
cp .env.example .env
```

Edita `.env` y establece `ADMIN_PASSWORD` con una contraseña aleatoria de al menos 16 caracteres. Por ejemplo, puedes generar una con `openssl rand -hex 24`. No subas `.env` a GitHub.

```sh
docker compose up -d --build
```

El puerto solo se publica en `127.0.0.1`. Para probar desde tu ordenador, abre un túnel:

```sh
ssh -L 8787:127.0.0.1:8787 usuario@tu-servidor
```

Abre `http://127.0.0.1:8787` en tu ordenador e introduce tu contraseña. Para utilizar un dominio público, configura HTTPS con un proxy como Caddy (ejemplo incluido) y cambia `PUBLIC_ORIGIN` a tu dominio HTTPS. No expongas el servicio público mediante HTTP.

## Preparar una automatización

1. Elige Soporte, Ventas o Citas y pon nombre al flujo.
2. Escribe información pública y real del negocio: servicios, precios, horarios, enlaces y condiciones. No incluyas contraseñas, claves, historias clínicas ni información interna que no deba conocer un cliente.
3. Elige proveedor y modelo. Introduce tu propia clave. La clave se cifra en el servidor y no se vuelve a mostrar.
4. Ajusta el límite diario de llamadas y los tokens de salida. Las llamadas de prueba también cuentan. El límite no es un presupuesto exacto en dinero.
5. Revisa las condiciones de datos y facturación del proveedor y marca la autorización de tratamiento correspondiente.
6. Guarda y pulsa **Probar IA**. Esta prueba sí usa tu API, pero no envía nada a WhatsApp.
7. Genera el QR. En el móvil: WhatsApp → Dispositivos vinculados → Vincular dispositivo.
8. Mantén el modo de prueba, indica otro número tuyo con prefijo y activa el flujo. Escribe desde ese teléfono y comprueba la respuesta recibida antes de abrirlo a otros contactos.

La aplicación se ejecuta en el servidor: puedes cerrar el navegador y tu ordenador. Si detienes o reinicias el servicio, las respuestas quedan apagadas hasta que vuelvas a entrar y las actives. En el modo Tools, cerrar sesión o revocarla detiene la conexión en su siguiente comprobación (hasta cinco minutos).

## APIs gratuitas y económicas

Información consultada el **28/10/2026**; los proveedores pueden cambiar modelos, cuotas y precios. Comprueba tu propia cuenta.

| Opción | Cómo empezar | Límites y coste |
|---|---|---|
| Gemini | Clave de Google AI Studio; ejemplo `gemini-2.5-flash-lite` | Nivel gratuito para proyectos elegibles. Si habilitas facturación puede haber cargos. La tarifa publicada para ese modelo es 0,10 USD/M tokens de entrada de texto y 0,40 USD/M de salida. |
| Groq | Clave de Groq; ejemplo `openai/gpt-oss-20b` | Cuotas según cuenta/modelo. La tarifa publicada del modelo es 0,075 USD/M de entrada y 0,30 USD/M de salida; no implica que todas las cuentas tengan gratuidad ilimitada. |
| OpenRouter | Clave de OpenRouter; `openrouter/free` o un modelo `:free` | La integración rechaza modelos de pago y establece precio máximo cero en el enrutado. La página del plan gratuito anuncia 50 peticiones diarias. La disponibilidad de cada modelo puede cambiar. |
| OpenAI | Clave de API y un modelo al que tu proyecto tenga acceso | Es una API de pago; ChatGPT Plus/Pro no incluye consumo de API. No se selecciona automáticamente como alternativa a una cuota gratuita agotada. |

No hay cambios automáticos a modelos de pago ni reintentos ilimitados. Un error de cuota pausa el flujo. Gemini y Groq no permiten a esta aplicación deducir con fiabilidad si tu clave está en un plan gratuito o con facturación: debes comprobarlo en su panel. El nombre del proveedor no garantiza coste cero.

Fuentes oficiales: [Gemini](https://ai.google.dev/gemini-api/docs/pricing), [Groq modelos](https://console.groq.com/docs/models), [Groq límites](https://console.groq.com/docs/rate-limits), [OpenRouter](https://openrouter.ai/pricing/), [variantes gratuitas](https://openrouter.ai/docs/guides/routing/model-variants/free), [OpenAI](https://developers.openai.com/api/docs/guides/text).

## Datos, aislamiento y límites

- Configuración, claves de API y credenciales de WhatsApp se guardan cifradas con AES-256-GCM. Cada espacio tiene un identificador y contexto criptográfico distinto; no puede leer los archivos de otro.
- La clave maestra queda en el volumen, en `/data/.masterkey`, con permisos restringidos. Quien controle el servidor y esa clave podrá descifrar los datos: el cifrado no protege frente a un administrador comprometido. Protege y respalda el volumen; sin la clave maestra no podrás recuperar las sesiones.
- No se exportan claves ni sesiones. No se escriben mensajes ni teléfonos en el registro visible de actividad.
- La memoria de conversación reside solo en RAM: hasta seis mensajes, 30 minutos y 30 conversaciones por espacio. Reiniciar borra esa memoria.
- Se ignoran mensajes antiguos, grupos y mensajes propios. `PERSONA` pausa el chat 24 horas; `BAJA` o `STOP` detienen sus respuestas.
- Deduplicación persistente y un intento por chat cada cinco minutos, 20 por hora y 200 al día. La cuota de llamadas a IA puede ser menor. Son límites propios, no reglas aprobadas por WhatsApp ni garantía frente a restricciones.
- Los mensajes se envían a la API que el propietario elija. Revisa sus condiciones para datos de clientes; las opciones gratuitas pueden tener condiciones distintas de las de pago. OpenAI se llama con `store:false`, lo que no sustituye sus políticas de retención aplicables.
- Ante un envío incierto no se reenvía automáticamente. Un resultado aceptado por la conexión no prueba entrega ni lectura.

## Desarrollo y pruebas

Node.js 22 o superior. No hace falta instalar navegadores ni modelos.

```sh
npm ci --ignore-scripts --no-fund
npm test
```

Para arrancar sin Docker, define `IQT_PASSWORD` e inicia `npm start`. No escribas una contraseña real en archivos del repositorio.

El modo alojado utiliza `IQT_AUTH_MODE=tools`, `IQT_BASE_PATH=/whatsapp-qr/app/`, `IQT_PUBLIC_ORIGIN=https://tools.iaquetrabaja.com` y acceso por la red privada al servicio de cuentas. Solo debe activarlo el operador del hosting; nunca apuntes ese servicio a una URL introducida por usuarios.

## Licencias y atribuciones

Interfaz, constructor, proveedores y lógica de automatización: IA que trabaja, MIT. La conexión depende de [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys), MIT, fijado a `7.0.0-rc14` (versión candidata). Se conservan las licencias de las dependencias. No somos WhatsApp ni Meta ni tenemos su aprobación.
