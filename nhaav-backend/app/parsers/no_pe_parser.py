import re


class NoPEParser:

    @staticmethod
    def _match(pattern, text):
        m = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if m:
            return " ".join(m.group(1).split()).strip()
        return None

    @classmethod
    def extract(cls, text):

        return {

            "vendor_name":
                cls._match(
                    r"We,\s*([^,\n(]+)",
                    text
                ),

            "registration_number":
                cls._match(
                    r"Corporate\s+Reg\.\s*no\.\s*([A-Za-z0-9\-]+)",
                    text
                ),

            "registered_address":
                cls._match(
                    r"registered address at\s*(.*?)\s*,\s*is a limited",
                    text
                ),

            "country":
                cls._match(
                    r"registered address at.*?,\s*([A-Za-z]+)\s*,\s*is a limited",
                    text
                ),

            "tax_residency":
                cls._match(
                    r"tax resident in\s*(.+?)\s*as per",
                    text
                ),

            "dtaa_country":
                cls._match(
                    r"India\s*[–-]\s*(.+?)\s*Double Taxation",
                    text
                ),

            "permanent_establishment": (
                "No"
                if re.search(r"does not have.*permanent establishment", text, re.I | re.S)
                else None
            ),

            "business_connection": (
                "No"
                if re.search(r"does not have any business connection", text, re.I | re.S)
                else None
            ),

            "goods_passed_outside_india": (
                "Yes"
                if re.search(r"title of goods/services.*passed outside India", text, re.I | re.S)
                else None
            ),

            "signatory_name":
                cls._match(
                    r"Name:\s*([^\n\r]+)",
                    text
                ),

            "signatory_title":
                cls._match(
                    r"Title:\s*([^\n\r]+)",
                    text
                ),

            "declaration_period":
                cls._match(
                    r"(?:Declaration\s+for\s+the\s+)?period\s*([^\n\r]+)",
                    text
                ),
        }