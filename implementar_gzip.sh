#!/bin/bash

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==========================================="
echo "IMPLEMENTACIÓN AUTOMÁTICA - SOLUCIÓN GZIP"
echo -e "===========================================${NC}\n"

# Verificar que estamos en un repositorio git
if [ ! -d .git ]; then
    echo -e "${RED}✗ Error: No estás en un repositorio git${NC}"
    echo "  Ejecuta primero: git init"
    exit 1
fi

echo -e "${GREEN}✓ Repositorio git detectado${NC}\n"

# Paso 1: Backup de archivos originales
echo -e "${BLUE}Paso 1: Creando backups...${NC}"
if [ -f liquidaciones.py ]; then
    cp liquidaciones.py liquidaciones_original.py.bak
    echo -e "${GREEN}✓ Backup de liquidaciones.py creado${NC}"
fi

if [ -f app.js ]; then
    cp app.js app_original.js.bak
    echo -e "${GREEN}✓ Backup de app.js creado${NC}"
fi

if [ -f index.html ]; then
    cp index.html index_original.html.bak
    echo -e "${GREEN}✓ Backup de index.html creado${NC}"
fi

# Paso 2: Verificar que existe liquidaciones.py
echo -e "\n${BLUE}Paso 2: Verificando archivos necesarios...${NC}"
if [ ! -f liquidaciones.py ]; then
    echo -e "${RED}✗ Error: liquidaciones.py no encontrado${NC}"
    exit 1
fi
echo -e "${GREEN}✓ liquidaciones.py encontrado${NC}"

# Paso 3: Agregar importación de gzip si no existe
echo -e "\n${BLUE}Paso 3: Actualizando liquidaciones.py...${NC}"
if ! grep -q "import gzip" liquidaciones.py; then
    # Buscar la línea de import json y agregar import gzip después
    sed -i '/^import json$/a import gzip' liquidaciones.py
    echo -e "${GREEN}✓ Importación de gzip agregada${NC}"
else
    echo -e "${YELLOW}⚠ gzip ya estaba importado${NC}"
fi

# Paso 4: Modificar la función exportar_json
echo -e "\n${BLUE}Paso 4: Modificando función de exportación...${NC}"

# Crear un archivo temporal con la función modificada
cat > /tmp/exportar_json_modificado.py << 'EOF'
    def exportar_json(self, tecnicos_data: Dict, ruta_salida: str = 'liquidaciones.json'):
        """
        Exporta los datos a archivos JSON (normal y comprimido)
        """
        resumen = self.generar_resumen_global(tecnicos_data)
        
        tecnicos_lista = []
        for tecnico_nombre, tecnico_data in tecnicos_data.items():
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
        
        tecnicos_lista.sort(key=lambda x: x['nombre'])
        
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
            # 1. Guardar JSON normal (para desarrollo/backup)
            with open(ruta_salida, 'w', encoding='utf-8') as f:
                json.dump(datos_completos, f, indent=2, ensure_ascii=False)
            
            tamano_normal = os.path.getsize(ruta_salida) / (1024 * 1024)
            
            # 2. Guardar JSON comprimido con GZIP
            ruta_comprimida = ruta_salida.replace('.json', '.json.gz')
            with gzip.open(ruta_comprimida, 'wt', encoding='utf-8') as f:
                json.dump(datos_completos, f, separators=(',', ':'), ensure_ascii=False)
            
            tamano_comprimido = os.path.getsize(ruta_comprimida) / (1024 * 1024)
            reduccion = ((tamano_normal - tamano_comprimido) / tamano_normal) * 100
            
            print(f"\n✓ Archivos generados exitosamente:")
            print(f"  JSON normal: {ruta_salida} ({tamano_normal:.2f} MB)")
            print(f"  JSON comprimido: {ruta_comprimida} ({tamano_comprimido:.2f} MB)")
            print(f"  Reducción: {reduccion:.1f}%")
            print(f"\n  Técnicos procesados: {len(tecnicos_lista)}")
            print(f"  Total tareas: {resumen['total_tareas']}")
            print(f"  Total a pagar: ${resumen['total_pagado']:,.2f}")
            
        except Exception as e:
            print(f"✗ Error al exportar JSON: {str(e)}")
            import traceback
            traceback.print_exc()
EOF

echo -e "${GREEN}✓ Función de exportación preparada${NC}"

# Paso 5: Actualizar index.html
echo -e "\n${BLUE}Paso 5: Actualizando index.html...${NC}"
if [ -f index.html ]; then
    # Verificar si pako ya está incluido
    if ! grep -q "pako" index.html; then
        # Buscar la línea antes de app.js y agregar pako
        sed -i 's|<script src="app.js"></script>|<script src="https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js"></script>\n    <script src="app.js"></script>|' index.html
        echo -e "${GREEN}✓ Biblioteca pako.js agregada a index.html${NC}"
    else
        echo -e "${YELLOW}⚠ pako.js ya estaba incluido${NC}"
    fi
else
    echo -e "${YELLOW}⚠ index.html no encontrado, saltando este paso${NC}"
fi

# Paso 6: Crear/actualizar .gitignore
echo -e "\n${BLUE}Paso 6: Configurando .gitignore...${NC}"
cat > .gitignore << 'EOF'
# Archivos JSON grandes sin comprimir
liquidaciones_db.json
liquidaciones.json

# Mantener solo versiones comprimidas
!liquidaciones_db.json.gz
!*.json.gz

# Backups
*.bak
*_backup.*

# Python
__pycache__/
*.py[cod]
venv/
.env

# IDEs
.vscode/
.idea/
.DS_Store
EOF

echo -e "${GREEN}✓ .gitignore configurado${NC}"

# Paso 7: Generar el JSON comprimido
echo -e "\n${BLUE}Paso 7: Generando JSON comprimido...${NC}"
echo -e "${YELLOW}Esto puede tomar varios minutos dependiendo del tamaño de la base de datos...${NC}\n"

python3 liquidaciones.py

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}✓ JSON generado exitosamente${NC}"
    
    # Mostrar tamaños
    if [ -f liquidaciones_db.json ]; then
        tamano_json=$(du -h liquidaciones_db.json | cut -f1)
        echo -e "  JSON normal: ${YELLOW}${tamano_json}${NC}"
    fi
    
    if [ -f liquidaciones_db.json.gz ]; then
        tamano_gz=$(du -h liquidaciones_db.json.gz | cut -f1)
        echo -e "  JSON comprimido: ${GREEN}${tamano_gz}${NC}"
    fi
else
    echo -e "${RED}✗ Error al generar JSON${NC}"
    exit 1
fi

# Paso 8: Preparar para commit
echo -e "\n${BLUE}Paso 8: Preparando archivos para Git...${NC}"

git add .gitignore
git add liquidaciones.py
if [ -f index.html ]; then
    git add index.html
fi
if [ -f app.js ]; then
    git add app.js
fi
if [ -f liquidaciones_db.json.gz ]; then
    git add liquidaciones_db.json.gz
fi

echo -e "${GREEN}✓ Archivos agregados a staging${NC}"

# Resumen final
echo -e "\n${BLUE}==========================================="
echo "IMPLEMENTACIÓN COMPLETADA"
echo -e "===========================================${NC}\n"

echo -e "${GREEN}✓ Todo listo para hacer commit${NC}\n"

echo "Próximos pasos:"
echo "1. Revisar los cambios:"
echo -e "   ${YELLOW}git status${NC}"
echo ""
echo "2. Hacer commit:"
echo -e "   ${YELLOW}git commit -m \"Optimizar: usar JSON comprimido con GZIP\"${NC}"
echo ""
echo "3. Subir a GitHub:"
echo -e "   ${YELLOW}git push origin main${NC}"
echo ""

echo -e "${BLUE}Nota:${NC} Los archivos de backup terminan en .bak y no se subirán a GitHub"
echo ""

# Verificar si el .json.gz es menor a 50MB
if [ -f liquidaciones_db.json.gz ]; then
    tamano_bytes=$(stat -f%z liquidaciones_db.json.gz 2>/dev/null || stat -c%s liquidaciones_db.json.gz 2>/dev/null)
    tamano_mb=$((tamano_bytes / 1024 / 1024))
    
    if [ $tamano_mb -lt 50 ]; then
        echo -e "${GREEN}✓ El archivo comprimido (${tamano_mb}MB) es menor a 50MB. GitHub lo aceptará sin problemas.${NC}"
    elif [ $tamano_mb -lt 100 ]; then
        echo -e "${YELLOW}⚠ El archivo comprimido (${tamano_mb}MB) está entre 50-100MB. GitHub lo aceptará pero puede dar advertencia.${NC}"
    else
        echo -e "${RED}✗ El archivo comprimido (${tamano_mb}MB) sigue siendo mayor a 100MB. Considera usar Git LFS o chunks.${NC}"
    fi
fi
