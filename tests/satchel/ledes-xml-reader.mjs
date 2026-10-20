// Independent reading of a public download, validated against LOC's untouched XSD.
import {execFileSync} from 'node:child_process';
export function readXml(file){
 execFileSync('xmllint',['--nonet','--noout','--schema','fixtures/ledes/Ledes213.xsd','-'],{input:file,stdio:['pipe','pipe','pipe']});
 return JSON.parse(execFileSync('python3',['-c',`import sys,json,xml.etree.ElementTree as E
r=E.fromstring(sys.stdin.read()); ns={'l':'http://www.ledes.org/ledes213.xsd'}
def row(e): return {c.tag.split('}')[-1]:c.text or '' for c in e if len(c)==0}
print(json.dumps({'firm':row(r.find('l:firm',ns)), 'client':row(r.find('.//l:client',ns)), 'invoice':row(r.find('.//l:invoice',ns)), 'matter':row(r.find('.//l:matter',ns)), 'fees':[row(e) for e in r.findall('.//l:fee',ns)], 'expenses':[row(e) for e in r.findall('.//l:expense',ns)], 'timekeepers':[row(e) for e in r.findall('.//l:tksum',ns)],'extensions':[{c.tag.split('}')[-1]:c.text for c in e} for e in r.findall('.//l:extend_data',ns)]}))`],{input:file,encoding:'utf8'}));
}
export const xmlProfile={workCountry:'USA',vendorId:'BL-HARBOR',clientFirmId:'HARBOR-ACCT',clientMatterId:'HM-2026-142',clientAddress:{line1:'150 Insurance Plaza',city:'New York',state:'NY',zip:'10005',country:'USA',phone:'212-555-0142'},billingContact:{firstName:'Avery',lastName:'Barton',email:'billing@example.test'},expenseTimekeeperId:'BL-001',expenseTimekeeperRateCents:30000};
