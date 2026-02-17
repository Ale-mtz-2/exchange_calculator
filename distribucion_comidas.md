Optimización del Algoritmo de Distribución
Problemas Identificados
Distribución Desigual de Leguminosas: La matriz actual asigna 0% de leguminosas al desayuno. En contextos latinos (ej. México), los frijoles en el desayuno son comunes. Con cargas altas (7 equivalentes), esto satura la comida y cena.
Artefactos de Redondeo en Cantidades Pequeñas: Para grupos con pocos equivalentes (ej. 1 de Grasa), la distribución porcentual dispersa genera valores que luego se recortan agresivamente, dejando huecos inesperados (ej. grasa en Desayuno y Cena, pero no en Comida).
Filas Redundantes: La aparición de "Leche" y "Semidescremada" sugiere que el catálogo de buckets contiene duplicados conceptuales. Esto es un problema de datos de entrada, pero el algoritmo debería ser robusto.
Propuesta de Cambios en 
packages/shared/src/algorithms/mealDistribution.ts
1. Ajuste de Matrices de Distribución
Se modificarán los porcentajes base para balancear mejor la carga, especialmente para 4 comidas (el caso del screenshot).

Para 4 Comidas:

Leguminosas (legume):
Actual: [0, 0, 60, 40]
Nuevo: [20, 0, 50, 30] (Permite frijoles en desayuno, reduce carga en cena).
Verduras (vegetable):
Actual: [10, 5, 45, 40]
Nuevo: [15, 10, 40, 35] (Mejora aporte en desayuno/colación).
Grasas (fat):
Actual: [25, 15, 30, 30]
Nuevo: [25, 10, 35, 30] (Ligeramente más peso a comida principal para evitar que se quede en 0 por redondeo).
Verificación
Generar un plan con el perfil observado.
Verificar que las leguminosas se distribuyan en el desayuno.
Verificar que la distribución se sienta más "natural".