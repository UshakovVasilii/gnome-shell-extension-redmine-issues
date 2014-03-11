#!/bin/sh
NAME=redmineIssues@UshakovVasilii_Github.yahoo.com
cd $NAME
zip -r $NAME.zip *
cd ..
mv $NAME/$NAME.zip .

