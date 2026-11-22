import re


class Form10FParser:

    @staticmethod
    def _match(pattern: str, text: str):
        m = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if m:
            return " ".join(m.group(1).split()).strip()
        return None

    @classmethod
    def extract(cls, text: str):

        data = {

            # Vendor information
            "vendor_name": cls._match(
                r"vendor\s+(.+?)\s*\(Corporate\s+Reg",
                text
            ),

            "registration_number": cls._match(
                r"Corporate\s+Reg\.\s*no\.\s*([A-Za-z0-9\-]+)",
                text
            ),

            # Table fields
            "status": cls._match(
                r"Status.*?:\s*(.+?)\s*\(ii\)",
                text
            ),

            "pan": cls._match(
                r"Permanent\s+Account\s+Number.*?:\s*([A-Z0-9]+)",
                text
            ),

            "country": cls._match(
                r"Nationality.*?:\s*(.+?)\s*\(iv\)",
                text
            ),

            "tax_identification_number": cls._match(
                r"tax\s+identification\s+number.*?:\s*([A-Za-z0-9\-]+)",
                text
            ),

            "residential_period": cls._match(
                r"applicable\s*:\s*(.+?)\s*\(vi\)",
                text
            ),

            "address": cls._match(
                r"Address\s+of\s+the\s+assessee.*?:\s*(.+?)\s*2\.",
                text
            ),

            # Government issuing TRC
            "government": cls._match(
                r"Government\s+of\s+([A-Za-z ]+)",
                text
            ),

            # Signature block
            "signatory_name": cls._match(
                r"Name:\s*(.+?)\s*Address:",
                text
            ),

            "signatory_pan": cls._match(
                r"Permanent\s+Account\s+Number:\s*([A-Za-z0-9]+)",
                text
            ),

            "verification_date": cls._match(
                r"Verified\s+today\s+the\s+([^\n\r]+)",
                text
            ),


            "financial_year": cls._match(
                r"financial year\s+([0-9]{4}\-[0-9]{2})",
                text
            ),
        }

        return data
