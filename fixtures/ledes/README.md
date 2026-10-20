# Official LEDES XML 2.1.3 schema

`Ledes213.xsd` is unchanged from the LEDES Oversight Committee's official
[LEDES213xsd.zip](https://ledes.org/wp-content/uploads/2020/07/LEDES213xsd.zip),
linked from its official media catalogue and the
[XML 2.1 format history](https://ledes.org/ledes-xml-ebilling-ver-2-1-format/).
It declares `ledesxmlebilling2.1.3` in `http://www.ledes.org/ledes213.xsd`.

TIME-007's public-door tests use `xmllint --nonet --schema` against this exact
schema, then independently read the downloaded invoice's amounts, codes and
identifiers. Install `libxml2-utils` on Linux; macOS includes `xmllint`.
