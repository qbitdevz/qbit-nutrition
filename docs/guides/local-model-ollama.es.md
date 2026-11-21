# Ejecutar un modelo local: Ollama en tu propio ordenador

Esta guía permite que Qbit Nutrition analice las fotos de tus comidas con un modelo que se ejecuta en **tu ordenador**, de
modo que no se envía nada a ninguna empresa y no se te cobra nada. El teléfono habla con tu ordenador a través de tu red
doméstica. [English version](local-model-ollama.md).

> **Verificada el 2026-11-21** en las páginas de Ollama, enlazadas en cada paso. Ollama cambia sus modelos, comandos y
> valores predeterminados: si algo no coincide con lo que ves, confía en la página de Ollama y
> [abre una incidencia](https://github.com/qbitdevz/qbit-nutrition/issues). **Los mantenedores aún no lo han probado en un
> teléfono real**, y la precisión de los modelos locales no se ha medido: espera respuestas más lentas y menos exactas que
> las de un modelo alojado, y revisa cada número que te dé.

## Antes de empezar

- Un ordenador (Windows, macOS o Linux) que permanezca encendido mientras escaneas, con espacio libre en disco para el
  modelo. Los modelos `gemma4` de la [página de la biblioteca de Ollama](https://ollama.com/library/gemma4) figuran con
  **4,6 a 7,5 GB** (`gemma4:e2b`), **6,6 a 9,5 GB** (`gemma4:e4b`) y unos **7,7 a 8 GB** (`gemma4:12b`), todos marcados
  como capaces de leer texto e imágenes. Empieza por el más pequeño.
- El teléfono y el ordenador en la **misma red Wi-Fi**.
- Cualquier dispositivo de esa red podrá usar tu modelo mientras sigues el paso 3. No lo expongas a internet. La propia
  Qbit Nutrition rechaza el `http://` sin cifrar hacia cualquier dirección que no sea de una red local o privada.

## 1. Instalar Ollama

Descárgalo desde [ollama.com/download](https://ollama.com/download) para tu sistema. En macOS y Linux la página también
muestra un comando de una línea (`curl -fsSL https://ollama.com/install.sh | sh`); en Windows hay un instalador.

## 2. Descargar un modelo que pueda ver imágenes

En una terminal (PowerShell en Windows):

```bash
ollama pull gemma4:e2b
```

La descarga es grande y se hace una sola vez. `ollama run gemma4:e2b` abre un chat, que es una forma rápida de comprobar que
funciona; escribe `/bye` para salir. La [API compatible con OpenAI](https://docs.ollama.com/openai) de Ollama lo sirve en
`/v1/chat/completions`, con las imágenes enviadas como URL de datos en base64, que es como la aplicación envía la foto. La
clave de API es «obligatoria pero se ignora»: la aplicación no necesita ninguna para Ollama.

## 3. Hacer que el teléfono llegue a tu ordenador

Ollama escucha solo en el propio ordenador (`127.0.0.1:11434`) a menos que lo cambies con la variable `OLLAMA_HOST`
([preguntas frecuentes de Ollama: «How can I expose Ollama on my network?»](https://docs.ollama.com/faq)). Ponla en
`0.0.0.0:11434`:

- **Windows:** cierra Ollama desde la barra de tareas, abre el menú Inicio y busca «variables de entorno», edita las
  variables de entorno de tu cuenta, agrega `OLLAMA_HOST` con el valor `0.0.0.0:11434`, guarda y vuelve a iniciar Ollama.
- **macOS:** `launchctl setenv OLLAMA_HOST "0.0.0.0:11434"` y reinicia Ollama.
- **Linux (systemd):** `sudo systemctl edit ollama.service`, agrega `Environment="OLLAMA_HOST=0.0.0.0:11434"` bajo
  `[Service]`, y luego `sudo systemctl daemon-reload` y `sudo systemctl restart ollama`.

Después averigua la dirección de tu ordenador en la red local (se parece a `192.168.1.23`): en los detalles del Wi-Fi de los
ajustes del sistema, o con `ipconfig` (Windows) o `ip addr` / `ifconfig` (Linux, macOS). Si el cortafuegos del ordenador
pregunta si permite Ollama en redes privadas, permítelo; abre el puerto 11434 solo en redes privadas.

Para comprobarlo desde el teléfono, abre `http://<esa dirección>:11434` en el navegador del teléfono: cualquier respuesta de
Ollama, en lugar de una espera agotada, significa que el teléfono puede llegar a él.

## 4. Agregarlo en la aplicación

1. En **Hoy**, abre **Ajustes** (el icono de controles deslizantes, arriba a la derecha), luego **Proveedores de IA** y
   después **Agregar un proveedor**.
2. Elige **Ollama (local server)**.
3. En **URL base**, sustituye `http://localhost:11434/v1` por `http://<la dirección de tu ordenador>:11434/v1`. En el
   teléfono, `localhost` significa el propio teléfono, no tu ordenador.
4. Deja **Clave de API** vacía. En **Modelo**, escribe `gemma4:e2b` (o el modelo que descargaste).
5. Sube el **Tiempo de espera** (hasta 300 segundos): la primera petición tras una pausa carga el modelo en memoria y puede
   ser lenta.
6. Pulsa **Probar conexión** y luego **Guardar proveedor**. Antes del primer escaneo la aplicación te dice que la foto se
   enviará a este proveedor; con esta configuración se queda en tu propia red.

## 5. Si algo sale mal

| Lo que ves | Qué hacer |
| --- | --- |
| La prueba no puede conectar | Abre `http://<dirección>:11434` en el navegador del teléfono. Si falla, el ordenador está suspendido, la dirección cambió, `OLLAMA_HOST` no se aplicó (reinicia Ollama) o un cortafuegos bloquea el puerto 11434. |
| Conecta pero responde muy despacio | Usa el modelo más pequeño, cierra otros programas y sube el tiempo de espera. Un ordenador sin tarjeta gráfica es lento con imágenes. |
| «El modelo no existe» | El nombre debe coincidir exactamente con `ollama list`, por ejemplo `gemma4:e2b`. |
| La dirección doméstica cambia | Tu router puede dar al ordenador otra dirección; fija una en el router o actualiza la URL base. |
