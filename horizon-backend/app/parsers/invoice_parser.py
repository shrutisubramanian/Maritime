import re


class InvoiceParser:

    @staticmethod
    def _match(pattern, text):
        m = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if m:
            return " ".join(m.group(1).split()).strip()
        return None

    @classmethod
    def extract(cls, text):

        return {
            "supplier_name": None,
            "supplier_gstin": None,
            "supplier_pan": None,
            "invoice_number": None,
            "invoice_date": None,
            "recipient_name": None,
            "recipient_gstin": None,
            "place_of_supply": None,
            "irn": None,
            "eway_bill_number": None,
            "description": None,
            "hsn_code": None,
            "quantity": None,
            "rate": None,
            "taxable_value": None,
            "cgst": None,
            "sgst": None,
            "igst": None,
            "total_invoice_amount": None,
            "bank_name": None,
            "account_number": None,
            "ifsc": None,
        }