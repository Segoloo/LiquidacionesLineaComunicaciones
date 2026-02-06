#!/usr/bin/env python3
"""
Script para explorar y encontrar los campos de región en la base de datos
Ejecutar: python3 explorar_regiones_bd.py > output_regiones.txt
"""

import mysql.connector
from mysql.connector import Error
import json
from collections import defaultdict

# Configuración de la base de datos
DB_CONFIG = {
    'host': '192.168.4.92',
    'port': 3306,
    'user': 'root',
    'password': 'An4l1t1c4l1n34*',
    'database': 'lineacom_analitica'
}

def conectar():
    """Conecta a la base de datos"""
    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        if connection.is_connected():
            print("=" * 80)
            print("CONEXIÓN EXITOSA A LA BASE DE DATOS")
            print("=" * 80)
            return connection
    except Error as e:
        print(f"Error al conectar: {e}")
        return None

def ejecutar_query(connection, query, descripcion):
    """Ejecuta una query y muestra los resultados"""
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(query)
        resultados = cursor.fetchall()
        cursor.close()
        
        print(f"\n{'=' * 80}")
        print(f"{descripcion}")
        print(f"{'=' * 80}")
        
        if not resultados:
            print("  (Sin resultados)")
            return []
        
        # Mostrar resultados
        for i, row in enumerate(resultados, 1):
            print(f"\n[{i}] ", end="")
            for key, value in row.items():
                print(f"{key}: {value}", end=" | ")
        
        print(f"\n\nTotal de registros: {len(resultados)}")
        return resultados
        
    except Error as e:
        print(f"Error ejecutando query: {e}")
        return []

def main():
    connection = conectar()
    if not connection:
        return
    
    try:
        # 1. Explorar columnas de sitios_linea
        query1 = "SHOW COLUMNS FROM sitios_linea"
        ejecutar_query(connection, query1, "1. COLUMNAS DE LA TABLA sitios_linea")
        
        # 2. Regiones únicas en sitios_linea
        query2 = """
        SELECT 
            Región AS Region,
            COUNT(*) AS Cantidad_Sitios
        FROM sitios_linea
        WHERE Región IS NOT NULL AND Región != ''
        GROUP BY Región
        ORDER BY Cantidad_Sitios DESC
        """
        regiones = ejecutar_query(connection, query2, "2. REGIONES ÚNICAS EN sitios_linea")
        
        # 3. Buscar campos relacionados con región en data_linea_todos
        query3 = """
        SELECT 
            COLUMN_NAME,
            DATA_TYPE,
            COLUMN_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'lineacom_analitica' 
            AND TABLE_NAME = 'data_linea_todos'
            AND (
                COLUMN_NAME LIKE '%region%' 
                OR COLUMN_NAME LIKE '%bodega%'
                OR COLUMN_NAME LIKE '%zona%'
                OR COLUMN_NAME LIKE '%sede%'
            )
        """
        ejecutar_query(connection, query3, "3. CAMPOS RELACIONADOS CON REGIÓN EN data_linea_todos")
        
        # 4. Contar tareas por región usando el JOIN
        query4 = """
        SELECT 
            COALESCE(sl.Región, 'SIN REGIÓN') AS Region,
            COUNT(DISTINCT dlt.tarea) AS Total_Tareas,
            COUNT(DISTINCT dlt.tecnico) AS Total_Tecnicos
        FROM data_linea_todos dlt
        LEFT JOIN sitios_linea sl ON dlt.codigo_sitio = sl.Código
        LEFT JOIN facturacion_linea fl ON dlt.formulario = fl.formulario
        WHERE dlt.tecnico IS NOT NULL 
            AND dlt.tecnico != ''
            AND fl.prod_tecnico_final IS NOT NULL
            AND fl.prod_tecnico_final > 0
        GROUP BY sl.Región
        ORDER BY Total_Tareas DESC
        """
        tareas_por_region = ejecutar_query(connection, query4, "4. TAREAS POR REGIÓN (con datos de liquidación)")
        
        # 5. Valores distintos de zona_coordinador
        query5 = """
        SELECT DISTINCT zona_coordinador, COUNT(*) as cantidad
        FROM data_linea_todos
        WHERE zona_coordinador IS NOT NULL AND zona_coordinador != ''
        GROUP BY zona_coordinador
        ORDER BY cantidad DESC
        """
        ejecutar_query(connection, query5, "5. VALORES DE zona_coordinador")
        
        # 6. Valores distintos de ciudad_sede
        query6 = """
        SELECT DISTINCT ciudad_sede, COUNT(*) as cantidad
        FROM data_linea_todos
        WHERE ciudad_sede IS NOT NULL AND ciudad_sede != ''
        GROUP BY ciudad_sede
        ORDER BY cantidad DESC
        """
        ejecutar_query(connection, query6, "6. VALORES DE ciudad_sede")
        
        # 7. Ejemplo de datos con JOIN
        query7 = """
        SELECT 
            dlt.tarea,
            dlt.tecnico,
            dlt.codigo_sitio,
            dlt.departamento AS dept_data_linea,
            dlt.ciudad AS ciudad_data_linea,
            dlt.zona_coordinador,
            dlt.ciudad_sede,
            sl.Región AS region_sitios,
            sl.Partido_Departamento AS dept_sitios,
            sl.Ciudad AS ciudad_sitios
        FROM data_linea_todos dlt
        LEFT JOIN sitios_linea sl ON dlt.codigo_sitio = sl.Código
        LEFT JOIN facturacion_linea fl ON dlt.formulario = fl.formulario
        WHERE dlt.tecnico IS NOT NULL 
            AND dlt.tecnico != ''
            AND fl.prod_tecnico_final IS NOT NULL
            AND fl.prod_tecnico_final > 0
        LIMIT 30
        """
        ejecutar_query(connection, query7, "7. EJEMPLO DE DATOS CON JOIN (primeros 30 registros)")
        
        # 8. Resumen de cobertura de regiones
        query8 = """
        SELECT 
            CASE 
                WHEN sl.Región IS NOT NULL AND sl.Región != '' THEN 'Con Región'
                ELSE 'Sin Región'
            END AS Estado,
            COUNT(*) AS Cantidad_Tareas
        FROM data_linea_todos dlt
        LEFT JOIN sitios_linea sl ON dlt.codigo_sitio = sl.Código
        LEFT JOIN facturacion_linea fl ON dlt.formulario = fl.formulario
        WHERE dlt.tecnico IS NOT NULL 
            AND dlt.tecnico != ''
            AND fl.prod_tecnico_final IS NOT NULL
            AND fl.prod_tecnico_final > 0
        GROUP BY Estado
        """
        ejecutar_query(connection, query8, "8. COBERTURA DE REGIONES EN TAREAS CON LIQUIDACIÓN")
        
        # RESUMEN FINAL
        print("\n" + "=" * 80)
        print("RESUMEN Y RECOMENDACIONES")
        print("=" * 80)
        
        if regiones:
            print(f"\n✓ Se encontraron {len(regiones)} regiones en sitios_linea:")
            for region in regiones:
                print(f"  - {region['Region']}: {region['Cantidad_Sitios']} sitios")
        
        if tareas_por_region:
            print(f"\n✓ Distribución de tareas con liquidación por región:")
            for item in tareas_por_region:
                print(f"  - {item['Region']}: {item['Total_Tareas']} tareas, {item['Total_Tecnicos']} técnicos")
        
        print("\n" + "=" * 80)
        
    finally:
        if connection and connection.is_connected():
            connection.close()
            print("\nConexión cerrada")

if __name__ == "__main__":
    main()