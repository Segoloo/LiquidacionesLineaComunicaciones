#!/usr/bin/env python3
"""
Script para extraer información de liquidaciones de técnicos desde MySQL
Lee datos de data_linea_todos + facturacion_linea y genera JSON con resumen
"""

import mysql.connector
from mysql.connector import Error
import json
import gzip
from datetime import datetime
from typing import Dict, List, Optional
import sys
import os

# Configuración de la base de datos
DB_CONFIG = {
    'host': '192.168.4.92',
    'port': 3306,
    'user': 'root',
    'password': 'An4l1t1c4l1n34*',
    'database': 'lineacom_analitica'
}

# Configuración de descuentos por tipología (según imagen adjunta)
DESCUENTOS = {
    'TIPO I': 0.20,      # 20%
    'TIPO II': 0.30,     # 30%
    'TIPO III': 0.50,    # 50%
    'TIPO IV': 0.50,     # 50%
    'TIPO V': 0.60,      # 60%
    'PRINCIPAL': 0.20,   # 20%
    'INTERMEDIA': 0.30,  # 30%
    'LEJANA': 0.50       # 50%
}

class ExtractorLiquidacionesDB:
    """Clase para extraer y procesar liquidaciones desde la base de datos"""
    
    def __init__(self, db_config: dict):
        self.db_config = db_config
        self.connection = None
        self.liquidaciones = {}
        
    def conectar(self) -> bool:
        """
        Establece conexión con la base de datos MySQL
        
        Returns:
            True si la conexión fue exitosa, False en caso contrario
        """
        try:
            self.connection = mysql.connector.connect(**self.db_config)
            if self.connection.is_connected():
                db_info = self.connection.server_info  # Usar propiedad en vez de método
                print(f"✓ Conectado a MySQL Server versión {db_info}")
                cursor = self.connection.cursor()
                cursor.execute("SELECT DATABASE();")
                record = cursor.fetchone()
                print(f"✓ Conectado a la base de datos: {record[0]}")
                cursor.close()
                return True
        except Error as e:
            print(f"✗ Error al conectar a MySQL: {e}")
            return False
    
    def desconectar(self):
        """Cierra la conexión con la base de datos"""
        if self.connection and self.connection.is_connected():
            self.connection.close()
            print("✓ Conexión a MySQL cerrada")
    
    def obtener_tablas_disponibles(self) -> List[str]:
        """
        Obtiene la lista de tablas disponibles en la base de datos
        
        Returns:
            Lista con nombres de tablas
        """
        try:
            cursor = self.connection.cursor()
            cursor.execute("SHOW TABLES")
            tablas = [tabla[0] for tabla in cursor.fetchall()]
            cursor.close()
            return tablas
        except Error as e:
            print(f"✗ Error al obtener tablas: {e}")
            return []
    
    def extraer_tareas(self, fecha_inicio: Optional[str] = None, fecha_fin: Optional[str] = None) -> List[Dict]:
        """
        Extrae datos de tareas con JOIN entre data_linea_todos y facturacion_linea
        
        Args:
            fecha_inicio: Fecha inicio en formato 'YYYY-MM-DD' (opcional)
            fecha_fin: Fecha fin en formato 'YYYY-MM-DD' (opcional)
            
        Returns:
            Lista de diccionarios con información de tareas
        """
        try:
            cursor = self.connection.cursor(dictionary=True)
            
            # Query con JOIN para obtener valores reales de facturacion_linea
            query = """
                SELECT 
                    dlt.tarea,
                    dlt.formulario,
                    dlt.tipo_actividad,
                    dlt.tecnico,
                    dlt.tipologia,
                    dlt.trayecto,
                    dlt.fecha_cierre_plataforma_cliente,
                    dlt.fecha_fin,
                    dlt.ciudad,
                    dlt.departamento,
                    dlt.nombre_punto,
                    dlt.codigo_sitio,
                    dlt.estado_ta,
                    dlt.estado_fo,
                    dlt.forma_atencion,
                    dlt.resultado_actividad,
                    dlt.zona_coordinador,
                    dlt.analista_asignado,
                    dlt.ciudad_sede,
                    dlt.nombre_proyecto,
                    dlt.formato,
                    dlt.cadena,
                    dlt.estado_actividad,
                    fl.prod_tecnico_final,
                    fl.total_facturacion,
                    fl.valor_total_entidad,
                    fl.valor_total_red
                FROM data_linea_todos dlt
                LEFT JOIN facturacion_linea fl ON dlt.formulario = fl.formulario
                WHERE dlt.tecnico IS NOT NULL 
                AND dlt.tecnico != ''
                AND fl.prod_tecnico_final IS NOT NULL
                AND fl.prod_tecnico_final > 0
            """
            
            params = []
            
            # Agregar filtros de fecha si se proporcionan
            if fecha_inicio:
                query += " AND dlt.fecha_cierre_plataforma_cliente >= %s"
                params.append(fecha_inicio)
            if fecha_fin:
                query += " AND dlt.fecha_cierre_plataforma_cliente <= %s"
                params.append(fecha_fin)
            
            query += " ORDER BY dlt.fecha_cierre_plataforma_cliente DESC"
            
            cursor.execute(query, params)
            resultados = cursor.fetchall()
            cursor.close()
            
            print(f"✓ Extraídos {len(resultados)} registros con valores de liquidación")
            return resultados
            
        except Error as e:
            print(f"✗ Error al extraer tareas: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def clasificar_tipo_origen(self, tipo_actividad: str) -> str:
        """
        Clasifica el tipo de origen de la tarea basado en el tipo de actividad
        
        Args:
            tipo_actividad: Tipo de actividad de la tarea
            
        Returns:
            String con el tipo
        """
        if not tipo_actividad:
            return 'OTRA'
        
        tipo_lower = str(tipo_actividad).lower()
        
        # Cierres
        if 'cierre' in tipo_lower:
            return 'CIERRE'
        
        # Incidentes
        if 'incidente' in tipo_lower or 'soporte' in tipo_lower or 'correctivo' in tipo_lower:
            return 'INCIDENTE'
        
        # Implementaciones / Instalaciones / Aperturas
        if any(x in tipo_lower for x in ['implementacion', 'instalacion', 'apertura', 'migracion']):
            return 'IMPLEMENTACION'
        
        # POS / Datafonos / Envíos
        if any(x in tipo_lower for x in ['pos', 'datafono', 'envio', 'retiro']):
            return 'POS'
        
        # Órdenes de cambio
        if 'oc' in tipo_lower or 'orden de cambio' in tipo_lower or 'orden' in tipo_lower:
            return 'ORDEN_CAMBIO'
        
        # Visitas / Rollos
        if 'rollo' in tipo_lower or 'visita' in tipo_lower:
            return 'VISITA'
        
        return 'OTRA'
    
    def procesar_tareas(self, tareas: List[Dict]) -> Dict:
        """
        Procesa lista de tareas y las agrupa por técnico
        
        Args:
            tareas: Lista de diccionarios con tareas
            
        Returns:
            Diccionario con datos agrupados por técnico
        """
        tecnicos_data = {}
        tareas_sin_fecha = 0
        tareas_procesadas = 0
        
        for tarea in tareas:
            tecnico = str(tarea.get('tecnico', '')).strip()
            if not tecnico or tecnico.upper() == 'NONE':
                continue
            
            tipologia = str(tarea.get('tipologia', '') or '').strip().upper()
            
            # Obtener fecha de cierre
            fecha_cierre = tarea.get('fecha_cierre_plataforma_cliente')
            if not fecha_cierre:
                fecha_cierre = tarea.get('fecha_fin')
            
            if not fecha_cierre:
                tareas_sin_fecha += 1
                continue
            
            # Si es string, intentar convertir
            if isinstance(fecha_cierre, str):
                try:
                    fecha_cierre = datetime.strptime(fecha_cierre, '%Y-%m-%d %H:%M:%S')
                except:
                    tareas_sin_fecha += 1
                    continue
            
            mes = fecha_cierre.month
            anio = fecha_cierre.year
            mes_nombre = fecha_cierre.strftime('%B %Y')
            
            # Clasificar tipo de origen
            tipo_actividad = tarea.get('tipo_actividad', '')
            tipo_origen = self.clasificar_tipo_origen(tipo_actividad)
            
            # IMPORTANTE: Usar el valor de prod_tecnico_final directamente
            valor_bruto = float(tarea.get('prod_tecnico_final', 0) or 0)
            
            if valor_bruto <= 0:
                continue
            
            # Calcular descuento según tipología
            porcentaje_descuento = DESCUENTOS.get(tipologia, 0)
            descuento = valor_bruto * porcentaje_descuento
            valor_neto = valor_bruto - descuento
            
            # Inicializar técnico si no existe
            if tecnico not in tecnicos_data:
                tecnicos_data[tecnico] = {
                    'nombre': tecnico,
                    'meses': {},
                    'total_general': 0,
                    'total_tareas': 0,
                    'por_tipo_origen': {}
                }
            
            # Inicializar mes si no existe
            if mes_nombre not in tecnicos_data[tecnico]['meses']:
                tecnicos_data[tecnico]['meses'][mes_nombre] = {
                    'mes': mes_nombre,
                    'mes_numero': mes,
                    'anio': anio,
                    'tareas': [],
                    'resumen_tipologias': {},
                    'por_tipo_origen': {},
                    'total_bruto': 0,
                    'total_descuentos': 0,
                    'total_neto': 0,
                    'cantidad_tareas': 0
                }
            
            mes_data = tecnicos_data[tecnico]['meses'][mes_nombre]
            
            # Crear registro de tarea
            tarea_registro = {
                'tarea': tarea.get('tarea', ''),
                'formulario': tarea.get('formulario', ''),
                'tipo_origen': tipo_origen,
                'tipo_actividad': tipo_actividad,
                'tipificacion': tipologia,
                'trayecto': tarea.get('trayecto', ''),
                'valor_bruto': round(valor_bruto, 2),
                'porcentaje_descuento': porcentaje_descuento * 100,
                'valor_descuento': round(descuento, 2),
                'valor_neto': round(valor_neto, 2),
                'fecha_cierre': fecha_cierre.strftime('%Y-%m-%d %H:%M:%S'),
                'ciudad': tarea.get('ciudad', ''),
                'departamento': tarea.get('departamento', ''),
                'nombre_punto': tarea.get('nombre_punto', ''),
                'estado_ta': tarea.get('estado_ta', ''),
                'estado_fo': tarea.get('estado_fo', ''),
                'resultado': tarea.get('resultado_actividad', '')
            }
            
            # Agregar tarea
            mes_data['tareas'].append(tarea_registro)
            mes_data['total_bruto'] += valor_bruto
            mes_data['total_descuentos'] += descuento
            mes_data['total_neto'] += valor_neto
            mes_data['cantidad_tareas'] += 1
            
            # Actualizar contadores por tipo de origen (mes)
            if tipo_origen not in mes_data['por_tipo_origen']:
                mes_data['por_tipo_origen'][tipo_origen] = {'cantidad': 0, 'total': 0}
            mes_data['por_tipo_origen'][tipo_origen]['cantidad'] += 1
            mes_data['por_tipo_origen'][tipo_origen]['total'] += valor_neto
            
            # Actualizar contadores por tipo de origen (técnico)
            if tipo_origen not in tecnicos_data[tecnico]['por_tipo_origen']:
                tecnicos_data[tecnico]['por_tipo_origen'][tipo_origen] = {'cantidad': 0, 'total': 0}
            tecnicos_data[tecnico]['por_tipo_origen'][tipo_origen]['cantidad'] += 1
            tecnicos_data[tecnico]['por_tipo_origen'][tipo_origen]['total'] += valor_neto
            
            # Actualizar resumen por tipología
            if tipologia and tipologia != '':
                if tipologia not in mes_data['resumen_tipologias']:
                    mes_data['resumen_tipologias'][tipologia] = {
                        'cantidad': 0,
                        'total_bruto': 0,
                        'total_neto': 0,
                        'porcentaje_descuento': porcentaje_descuento * 100
                    }
                
                mes_data['resumen_tipologias'][tipologia]['cantidad'] += 1
                mes_data['resumen_tipologias'][tipologia]['total_bruto'] += valor_bruto
                mes_data['resumen_tipologias'][tipologia]['total_neto'] += valor_neto
            
            # Actualizar totales generales del técnico
            tecnicos_data[tecnico]['total_general'] += valor_neto
            tecnicos_data[tecnico]['total_tareas'] += 1
            
            tareas_procesadas += 1
        
        print(f"  ✓ Procesadas {tareas_procesadas} tareas")
        if tareas_sin_fecha > 0:
            print(f"  ⚠ {tareas_sin_fecha} tareas sin fecha de cierre (excluidas)")
        
        return tecnicos_data
    
    def generar_resumen_global(self, tecnicos_data: Dict) -> Dict:
        """
        Genera un resumen global con estadísticas
        
        Args:
            tecnicos_data: Diccionario con datos de técnicos
            
        Returns:
            Diccionario con resumen global
        """
        total_tecnicos = len(tecnicos_data)
        total_tareas = sum(t['total_tareas'] for t in tecnicos_data.values())
        total_pagado = sum(t['total_general'] for t in tecnicos_data.values())
        
        # Contar por tipo de origen
        por_tipo_origen = {}
        for tecnico_data in tecnicos_data.values():
            for tipo, datos in tecnico_data['por_tipo_origen'].items():
                if tipo not in por_tipo_origen:
                    por_tipo_origen[tipo] = {'cantidad': 0, 'total': 0}
                por_tipo_origen[tipo]['cantidad'] += datos['cantidad']
                por_tipo_origen[tipo]['total'] += datos['total']
        
        # Encontrar meses únicos
        meses_unicos = set()
        for tecnico in tecnicos_data.values():
            meses_unicos.update(tecnico['meses'].keys())
        
        return {
            'fecha_generacion': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'total_tecnicos': total_tecnicos,
            'total_tareas': total_tareas,
            'total_pagado': round(total_pagado, 2),
            'por_tipo_origen': por_tipo_origen,
            'meses_disponibles': sorted(list(meses_unicos)),
            'descuentos_configurados': DESCUENTOS
        }
    
    def exportar_json(self, tecnicos_data: Dict, ruta_salida: str = 'liquidaciones.json'):
        """
        Exporta los datos a archivos JSON (normal y comprimido)
        """
        resumen = self.generar_resumen_global(tecnicos_data)
        
        # Convertir meses de dict a list para mejor visualización
        tecnicos_lista = []
        for tecnico_nombre, tecnico_data in tecnicos_data.items():
            # Redondear totales por tipo origen
            por_tipo_origen_redondeado = {}
            for tipo, datos in tecnico_data['por_tipo_origen'].items():
                por_tipo_origen_redondeado[tipo] = {
                    'cantidad': datos['cantidad'],
                    'total': round(datos['total'], 2)
                }
            
            tecnico_export = {
                'nombre': tecnico_data['nombre'],
                'total_general': round(tecnico_data['total_general'], 2),
                'total_tareas': tecnico_data['total_tareas'],
                'por_tipo_origen': por_tipo_origen_redondeado,
                'meses': list(tecnico_data['meses'].values())
            }
            tecnicos_lista.append(tecnico_export)
        
        # Ordenar técnicos por nombre
        tecnicos_lista.sort(key=lambda x: x['nombre'])
        
        # Redondear totales en resumen
        resumen['por_tipo_origen'] = {
            tipo: {
                'cantidad': datos['cantidad'],
                'total': round(datos['total'], 2)
            }
            for tipo, datos in resumen['por_tipo_origen'].items()
        }
        
        datos_completos = {
            'resumen': resumen,
            'tecnicos': tecnicos_lista
        }

        try:
            # 1. JSON normal (backup)
            with open(ruta_salida, 'w', encoding='utf-8') as f:
                json.dump(datos_completos, f, indent=2, ensure_ascii=False)
            
            tamano_normal = os.path.getsize(ruta_salida) / (1024 * 1024)
            
            # 2. JSON COMPRIMIDO - ESTE ES EL IMPORTANTE
            import gzip
            ruta_comprimida = ruta_salida.replace('.json', '.json.gz')
            with gzip.open(ruta_comprimida, 'wt', encoding='utf-8') as f:
                json.dump(datos_completos, f, separators=(',', ':'), ensure_ascii=False)
            
            tamano_comprimido = os.path.getsize(ruta_comprimida) / (1024 * 1024)
            reduccion = ((tamano_normal - tamano_comprimido) / tamano_normal) * 100
            
            print(f"\n✓ Archivos generados exitosamente:")
            print(f"  JSON normal: {ruta_salida} ({tamano_normal:.2f} MB)")
            print(f"  JSON COMPRIMIDO: {ruta_comprimida} ({tamano_comprimido:.2f} MB)")
            print(f"  Reducción: {reduccion:.1f}%")
            print(f"\n  Técnicos procesados: {len(tecnicos_lista)}")
            print(f"  Total tareas: {resumen['total_tareas']}")
            print(f"  Total a pagar: ${resumen['total_pagado']:,.2f}")
            
        except Exception as e:
            print(f"✗ Error al exportar JSON: {str(e)}")
            import traceback
            traceback.print_exc()
        


        try:
            with open(ruta_salida, 'w', encoding='utf-8') as f:
                json.dump(datos_completos, f, indent=2, ensure_ascii=False)
            print(f"\n✓ JSON generado exitosamente: {ruta_salida}")
            print(f"  Técnicos procesados: {len(tecnicos_lista)}")
            print(f"  Total tareas: {resumen['total_tareas']}")
            print(f"  Total a pagar: ${resumen['total_pagado']:,.2f}")
            print(f"\n  Por tipo de origen:")
            for tipo, datos in sorted(resumen['por_tipo_origen'].items()):
                print(f"    {tipo}: {datos['cantidad']} tareas - ${datos['total']:,.2f}")
        except Exception as e:
            print(f"✗ Error al exportar JSON: {str(e)}")
            import traceback
            traceback.print_exc()
    
    def mostrar_resumen_tecnico(self, tecnicos_data: Dict, nombre_tecnico: str):
        """
        Muestra un resumen de un técnico específico
        
        Args:
            tecnicos_data: Diccionario con datos de técnicos
            nombre_tecnico: Nombre del técnico a consultar
        """
        # Buscar técnico (case insensitive)
        tecnico_encontrado = None
        for nombre, data in tecnicos_data.items():
            if nombre_tecnico.upper() in nombre.upper():
                tecnico_encontrado = data
                break
        
        if not tecnico_encontrado:
            print(f"\n✗ Técnico '{nombre_tecnico}' no encontrado")
            print("\nTécnicos disponibles (primeros 10):")
            for i, nombre in enumerate(list(tecnicos_data.keys())[:10]):
                print(f"  {i+1}. {nombre}")
            return
        
        print(f"\n{'='*80}")
        print(f"RESUMEN PARA: {tecnico_encontrado['nombre']}")
        print(f"{'='*80}")
        print(f"Total general: ${tecnico_encontrado['total_general']:,.2f}")
        print(f"Total tareas: {tecnico_encontrado['total_tareas']}")
        
        print(f"\nPor tipo de origen:")
        for tipo, datos in sorted(tecnico_encontrado['por_tipo_origen'].items()):
            if datos['cantidad'] > 0:
                print(f"  {tipo}: {datos['cantidad']} tareas - ${datos['total']:,.2f}")
        
        print(f"\nDetalle por mes (últimos 3 meses):")
        print(f"{'-'*80}")
        
        # Mostrar solo los últimos 3 meses
        meses_ordenados = sorted(tecnico_encontrado['meses'].items(), 
                                key=lambda x: (x[1]['anio'], x[1]['mes_numero']), 
                                reverse=True)
        
        for mes_nombre, mes_data in meses_ordenados[:3]:
            print(f"\n{mes_nombre}:")
            print(f"  Tareas: {mes_data['cantidad_tareas']}")
            print(f"  Total bruto: ${mes_data['total_bruto']:,.2f}")
            print(f"  Descuentos: ${mes_data['total_descuentos']:,.2f}")
            print(f"  Total neto: ${mes_data['total_neto']:,.2f}")
            
            if mes_data['por_tipo_origen']:
                print(f"\n  Por tipo de origen:")
                for tipo, datos in sorted(mes_data['por_tipo_origen'].items()):
                    if datos['cantidad'] > 0:
                        print(f"    {tipo}: {datos['cantidad']} tareas - ${datos['total']:,.2f}")
            
            if mes_data['resumen_tipologias']:
                print(f"\n  Por tipología:")
                for tipo, datos in sorted(mes_data['resumen_tipologias'].items()):
                    print(f"    {tipo}: {datos['cantidad']} tareas - ${datos['total_neto']:,.2f} (descuento {datos['porcentaje_descuento']}%)")
        
        print(f"\n{'='*80}")


def main():
    """Función principal"""
    print("="*80)
    print("EXTRACTOR DE LIQUIDACIONES - LINEACOM")
    print("="*80)
    
    # Crear extractor
    extractor = ExtractorLiquidacionesDB(DB_CONFIG)
    
    # Conectar a la base de datos
    print("\n1. Conectando a la base de datos...")
    if not extractor.conectar():
        print("✗ No se pudo conectar a la base de datos. Abortando.")
        return
    
    try:
        # Mostrar tablas disponibles
        print("\n2. Verificando tablas necesarias...")
        tablas = extractor.obtener_tablas_disponibles()
        tablas_necesarias = ['data_linea_todos', 'facturacion_linea']
        for tabla in tablas_necesarias:
            if tabla in tablas:
                print(f"  ✓ Tabla {tabla} encontrada")
            else:
                print(f"  ✗ Tabla {tabla} no encontrada")
                return
        
        # Extraer datos
        print("\n3. Extrayendo tareas con valores de liquidación...")
        tareas = extractor.extraer_tareas()
        
        if not tareas:
            print("✗ No se encontraron tareas con valores de liquidación")
            return
        
        # Procesar tareas
        print("\n4. Procesando tareas y agrupando por técnico...")
        tecnicos_data = extractor.procesar_tareas(tareas)
        print(f"  ✓ Procesados datos de {len(tecnicos_data)} técnicos")
        
        # Exportar a JSON
        print("\n5. Generando archivo JSON...")
        # Usar directorio actual en vez de /home/claude
        ruta_json = os.path.join(os.getcwd(), 'liquidaciones_db.json')
        extractor.exportar_json(tecnicos_data, ruta_json)
        
        # Mostrar ejemplo con un técnico
        if tecnicos_data:
            print("\n6. Ejemplo de consulta:")
            primer_tecnico = list(tecnicos_data.keys())[0]
            extractor.mostrar_resumen_tecnico(tecnicos_data, primer_tecnico.split()[0])
        
    finally:
        # Desconectar de la base de datos
        print("\n7. Cerrando conexión...")
        extractor.desconectar()
    
    print("\n" + "="*80)
    print("PROCESO COMPLETADO")
    print("="*80)


if __name__ == "__main__":
    main()