"""Validate the generated OpenAPI contract against the full OpenAPI schema."""
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'.tool-deps'))
from openapi_spec_validator import validate

if __name__=='__main__':
    contract=json.loads((Path(__file__).resolve().parents[1]/'contracts/openapi.yaml').read_text(encoding='utf-8'))
    validate(contract)
    print('PASS: complete OpenAPI 3.0 schema validation.')
