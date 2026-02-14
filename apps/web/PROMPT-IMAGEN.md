# Prompt para Generación de Imagen - Hero Illustration

Como la generación automática falló, aquí tienes un prompt detallado para generar la imagen manualmente usando herramientas como Midjourney, DALL-E 3, o Stable Diffusion (como Nano bannana).

## Descripción del Estilo
Queremos una ilustración 3D moderna, limpia y minimalista, adecuada para una landing page de una aplicación de nutrición profesional. El estilo debe ser suave, con iluminación difusa ("soft lighting"), colores pastel pero vibrantes en los elementos de comida, y un fondo muy limpio (blanco o azul cielo muy pálido).

## Prompt Sugerido (Inglés - Recomendado para la mayoría de IAs)

> **Prompt:** 
> A high-quality 3D isometric illustration for a nutrition app landing page. In the center, a floating sleek white card with the text "2000 KCAL" clearly visible in bold modern font. Surrounding the card, floating healthy food elements: a shiny red apple, a fresh orange carrot, a green spinach leaf, and a small bowl of healthy salad. The background is a soft gradient of white to very pale sky blue. The lighting is soft and studio-like, creating gentle shadows. The style is claymorphism or soft 3D, very clean, minimalist, and friendly. High resolution, 8k, unreal engine 5 render style.

## Prompt Sugerido (Español)

> **Prompt:**
> Ilustración 3D isométrica de alta calidad para la portada de una app de nutrición. En el centro, una tarjeta blanca flotante y elegante con el texto "2000 KCAL" claramente visible en una fuente moderna y negrita. Rodeando la tarjeta, elementos de comida saludable flotando: una manzana roja brillante, una zanahoria naranja fresca, una hoja de espinaca verde y un pequeño bol de ensalada saludable. El fondo es un degradado suave de blanco a azul cielo muy pálido. La iluminación es suave y de estudio, creando sombras delicadas. El estilo es claymorphism o 3D suave, muy limpio, minimalista y amigable. Alta resolución.

## Instrucciones Adicionales
1.  **Relación de Aspecto:** Generar en formato horizontal (16:9) o cuadrado (1:1) dependiendo de cómo prefieras integrarlo, pero para la sección "Hero" suele funcionar bien algo como 4:3 o 16:9 si va a ocupar mucho espacio, o 1:1 si es un elemento flotante a la derecha.
2.  **Texto:** Si la IA no genera el texto "2000 KCAL" correctamente, puedes generar la imagen sin texto y añadirlo después con Photoshop o CSS sobre la imagen.

## Ubicación
Una vez generada la imagen:
1.  Guárdala como `hero-illustration.png` en `apps/web/src/assets/`.
2.  Actualiza el componente `HeroIllustration.tsx` para usar esta imagen en lugar de los SVGs actuales.
