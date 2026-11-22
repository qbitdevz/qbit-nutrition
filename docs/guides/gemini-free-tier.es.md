# Configurar un proveedor de IA gratuito: Google Gemini

Esta guía conecta Qbit Nutrition con el nivel gratuito de la API de Google Gemini, para que puedas escanear fotos de tus
comidas sin pagar. [English version](gemini-free-tier.md).

> **Verificada el 2026-11-21** en las páginas de Google, enlazadas en cada paso. Google cambia límites, modelos y términos
> sin avisar: si algo de aquí no coincide con lo que ves, confía en la página de Google y
> [abre una incidencia](https://github.com/qbitdevz/qbit-nutrition/issues). La aplicación también muestra una nota de coste y
> la fecha de su última verificación cuando eliges un proveedor.

## Antes de empezar

- Necesitas una cuenta de Google y la aplicación instalada en tu teléfono.
- **No configures la facturación.** El nivel gratuito no necesita un medio de pago; un nivel de pago empieza solo cuando
  vinculas una cuenta de facturación
  ([niveles de uso](https://ai.google.dev/gemini-api/docs/rate-limits#usage-tiers)). Qbit Nutrition está pensada para no
  costar nada, así que quédate en el nivel gratuito.
- **Las fotos de tus comidas llegan a Google.** En el nivel gratuito Google indica que el contenido que envías se usa para
  mejorar sus productos ([precios](https://ai.google.dev/gemini-api/docs/pricing): «Content used to improve our products»
  en Free). No escanees nada privado y deja fuera del encuadre rostros y documentos. En el nivel de pago Google indica que
  no se usa, y es un motivo por el que algunas personas pagan; es decisión tuya y no es obligatorio.

## 1. Obtener una clave de API

1. Abre la [página de claves de API de Google AI Studio](https://aistudio.google.com/apikey) e inicia sesión.
2. Acepta los términos si te los pide. A una persona nueva se le crea un proyecto de Google Cloud predeterminado y una clave
   para él ([claves de API](https://ai.google.dev/gemini-api/docs/api-key)).
3. Crea una clave con **Create API key** si no se creó una por ti, y cópiala. Mantenla en privado: quien la tenga puede usar
   tu cupo. Si se filtra, elimínala en la misma página y crea otra.

Si usas un proyecto de Google Cloud que ya tenías, puede que tengas que importarlo primero en AI Studio y, para el nivel
gratuito, pasar la verificación del proyecto; la página de claves lo explica.

## 2. Conocer los límites

- **Nivel gratuito:** acceso limitado a ciertos modelos, con tokens de entrada y salida gratuitos. `gemini-3.5-flash-lite`,
  el modelo que Qbit Nutrition sugiere primero, figura como gratuito en el nivel gratuito
  ([precios](https://ai.google.dev/gemini-api/docs/pricing)).
- **Los límites de uso** se cuentan en peticiones por minuto, tokens por minuto y peticiones por día, por proyecto y por
  modelo. Las cifras cambian, así que Google no las imprime en su documentación: consulta las tuyas en
  [aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit). Los límites diarios se reinician a medianoche
  (hora del Pacífico) y Google indica que los límites no están garantizados
  ([límites de uso](https://ai.google.dev/gemini-api/docs/rate-limits)).
- Un escaneo es una petición. Si llegas a un límite, la aplicación dice que se agotó la cuota; espera o agrega el alimento
  con la búsqueda.

## 3. Agregarlo en la aplicación

1. En **Hoy**, abre **Ajustes** (el icono de controles deslizantes, arriba a la derecha), luego **Proveedores de IA** y
   después **Agregar un proveedor**.
2. Elige **Google Gemini API**. Lee las notas de coste y de uso de datos de la pantalla siguiente.
3. Pega la clave en **Clave de API**. La clave se guarda en el almacenamiento seguro de tu teléfono y nunca se vuelve a
   mostrar ni se incluye en una exportación.
4. En **Modelo**, deja `gemini-3.5-flash-lite` o elige otra sugerencia. Comprueba el modelo en la
   [página de precios](https://ai.google.dev/gemini-api/docs/pricing) de Google: no todos los modelos están en el nivel
   gratuito.
5. Pulsa **Probar conexión**. Envía un plato dibujado pequeño, no tus fotos. Corrige lo que indique (una clave incorrecta,
   el nombre del modelo, falta de red) y pulsa **Guardar proveedor**.
6. Tu primer proveedor pasa a ser el activo. Antes de tu primer escaneo la aplicación te dice adónde irá la foto;
   confírmalo.

## 4. Si algo sale mal

| Lo que ves | Qué hacer |
| --- | --- |
| Clave no válida | Copia la clave de nuevo desde AI Studio; comprueba que no haya espacios alrededor. |
| Cuota o «demasiadas peticiones» | Llegaste a un límite del nivel gratuito. Espera (los límites diarios se reinician a medianoche, hora del Pacífico), prueba otro modelo sugerido o registra la comida con la búsqueda. |
| La prueba falla pero la clave es correcta | Comprueba que el teléfono tiene red y que el nombre del modelo está escrito exactamente como en las páginas de Google. |

Para dejar de usarlo, abre el proveedor en **Proveedores de IA**, pulsa **Quitar la clave guardada** y elimina también la
clave en AI Studio.
